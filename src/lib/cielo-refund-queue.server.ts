// Processador da fila de reembolso Cielo.
// Server-only: chamado pelo cron /api/public/hooks/cielo-refund-retry.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { voidOrder } from "@/lib/cielo.server";

type QueueRow = {
  id: string;
  order_id: string;
  cielo_payment_id: string;
  amount: number;
  is_full: boolean;
  reason: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_cpf: string | null;
  payment_method: string | null;
  order_total: number | null;
  order_created_at: string | null;
  items: unknown;
  operator_id: string | null;
  operator_name: string | null;
  status: string;
  attempts: number;
  max_attempts: number;
};

// Backoff: 24h por padrão; se falhar por outros motivos, aplica escalonamento leve
function nextAttemptDelayMs(attempts: number, insufficientBalance: boolean): number {
  if (insufficientBalance) return 24 * 60 * 60 * 1000; // D+1
  // Erro transitório de rede/gateway: 1h, 3h, 6h, depois 24h
  if (attempts <= 1) return 60 * 60 * 1000;
  if (attempts <= 2) return 3 * 60 * 60 * 1000;
  if (attempts <= 3) return 6 * 60 * 60 * 1000;
  return 24 * 60 * 60 * 1000;
}

export async function processCieloRefundQueue(): Promise<{
  picked: number;
  completed: number;
  retried: number;
  failed: number;
}> {
  const now = new Date().toISOString();

  // Puxa lotes pequenos para evitar timeout do cron
  const { data: rows, error } = await supabaseAdmin
    .from("cielo_refund_queue")
    .select("*")
    .eq("status", "pending")
    .lte("next_attempt_at", now)
    .order("next_attempt_at", { ascending: true })
    .limit(10);

  if (error) {
    console.error("[cielo-refund-queue] fetch error", error);
    return { picked: 0, completed: 0, retried: 0, failed: 0 };
  }
  if (!rows || rows.length === 0) return { picked: 0, completed: 0, retried: 0, failed: 0 };

  let completed = 0;
  let retried = 0;
  let failed = 0;

  for (const row of rows as QueueRow[]) {
    // Trava a linha marcando como 'processing'
    const { data: locked, error: lockErr } = await supabaseAdmin
      .from("cielo_refund_queue")
      .update({ status: "processing", last_attempt_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (lockErr || !locked) continue; // outra execução pegou primeiro

    try {
      const amountCents = row.is_full ? undefined : Math.round(Number(row.amount) * 100);
      const voidRes = await voidOrder(row.cielo_payment_id, amountCents);

      if (voidRes.ok) {
        // Registra o refund histórico
        const mpRefundId = `cielo-void-${Date.now()}`;
        const { data: refund, error: insErr } = await supabaseAdmin
          .from("refunds")
          .insert({
            order_id: row.order_id,
            mp_payment_id: row.cielo_payment_id,
            mp_refund_id: mpRefundId,
            amount: row.amount,
            is_full: row.is_full,
            reason: row.reason,
            customer_name: row.customer_name,
            customer_email: row.customer_email,
            customer_phone: row.customer_phone,
            customer_cpf: row.customer_cpf,
            payment_method: row.payment_method,
            order_total: row.order_total,
            order_created_at: row.order_created_at,
            items: (row.items ?? []) as never,
            operator_id: row.operator_id,
            operator_name: row.operator_name,
          })
          .select("id")
          .maybeSingle();

        if (insErr) {
          console.error("[cielo-refund-queue] insert refund history failed", insErr);
          // volta para pending e tenta de novo depois
          await supabaseAdmin
            .from("cielo_refund_queue")
            .update({
              status: "pending",
              attempts: row.attempts + 1,
              last_error: "Estorno feito mas histórico falhou: " + insErr.message,
              next_attempt_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            })
            .eq("id", row.id);
          retried++;
          continue;
        }

        // Mantém o pedido e os itens (histórico). Marca como cancelado +
        // reembolsado — igual ao fluxo síncrono do refundOrder — para sair da
        // expedição e do faturamento (que só contam status='paid') sem perder
        // o vínculo do estorno. Estorno parcial não cancela o pedido.
        const orderUpdate: Record<string, unknown> = {
          refund_status: row.is_full ? "refunded" : "partially_refunded",
          refunded_at: new Date().toISOString(),
          refunded_amount: row.amount,
          refund_reason: row.reason,
          refunded_by: row.operator_id,
          refunded_by_name: row.operator_name,
        };
        if (row.is_full) orderUpdate.status = "cancelled";
        await supabaseAdmin.from("orders").update(orderUpdate as never).eq("id", row.order_id);

        await supabaseAdmin
          .from("cielo_refund_queue")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
            refund_id: refund?.id ?? null,
            last_error: null,
            last_error_code: null,
          })
          .eq("id", row.id);
        completed++;
        console.log("[cielo-refund-queue] completed", { queueId: row.id, orderId: row.order_id });
        continue;
      }

      // Falha recuperável ou terminal?
      const attempts = row.attempts + 1;
      const isRecoverable = voidRes.insufficientBalance === true;
      const reachedMax = attempts >= row.max_attempts;

      if (reachedMax) {
        await supabaseAdmin
          .from("cielo_refund_queue")
          .update({
            status: "failed",
            attempts,
            last_error: voidRes.returnMessage ?? `HTTP ${voidRes.status}`,
            last_error_code: voidRes.returnCode ?? null,
          })
          .eq("id", row.id);
        // Marca no pedido para operador ver
        await supabaseAdmin
          .from("orders")
          .update({ refund_status: "refund_failed" })
          .eq("id", row.order_id);
        failed++;
        console.error("[cielo-refund-queue] failed (max attempts)", { queueId: row.id, err: voidRes.returnMessage });
        continue;
      }

      const delay = nextAttemptDelayMs(attempts, isRecoverable);
      await supabaseAdmin
        .from("cielo_refund_queue")
        .update({
          status: "pending",
          attempts,
          last_error: voidRes.returnMessage ?? `HTTP ${voidRes.status}`,
          last_error_code: voidRes.returnCode ?? null,
          next_attempt_at: new Date(Date.now() + delay).toISOString(),
        })
        .eq("id", row.id);
      retried++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[cielo-refund-queue] unexpected error", msg);
      await supabaseAdmin
        .from("cielo_refund_queue")
        .update({
          status: "pending",
          attempts: row.attempts + 1,
          last_error: msg,
          next_attempt_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        })
        .eq("id", row.id);
      retried++;
    }
  }

  return { picked: rows.length, completed, retried, failed };
}
