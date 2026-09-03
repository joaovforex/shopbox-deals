// Server-only: dispara o estorno real na Cielo e, se falhar (ex.: saldo
// insuficiente em D+0), enfileira em cielo_refund_queue para retentativa
// automática pelo cron /api/public/hooks/cielo-refund-retry.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { voidOrder } from "@/lib/cielo.server";

export type CieloRefundContext = {
  orderId: string;
  cieloPaymentId: string;
  amount: number;
  isFull: boolean;
  reason: string;
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  customerCpf?: string | null;
  paymentMethod?: string | null;
  orderTotal?: number | null;
  orderCreatedAt?: string | null;
  items?: unknown;
  operatorId?: string | null;
  operatorName?: string | null;
};

export type CieloRefundOutcome =
  | { ok: true; queued: false; refundId: string; returnMessage?: string }
  | { ok: false; queued: true; error: string; insufficientBalance: boolean }
  | { ok: false; queued: false; error: string };

/** Tenta o void/estorno imediato; se falhar, enfileira a retentativa. */
export async function attemptCieloRefund(ctx: CieloRefundContext): Promise<CieloRefundOutcome> {
  let res: Awaited<ReturnType<typeof voidOrder>>;
  try {
    const amountCents = ctx.isFull ? undefined : Math.round(ctx.amount * 100);
    res = await voidOrder(ctx.cieloPaymentId, amountCents);
  } catch (err) {
    res = {
      ok: false,
      status: 0,
      returnMessage: err instanceof Error ? err.message : String(err),
    };
  }

  if (res.ok) {
    console.log("[cielo-refund] void ok", { orderId: ctx.orderId, amount: ctx.amount });
    return {
      ok: true,
      queued: false,
      refundId: `cielo-void-${Date.now()}`,
      returnMessage: res.returnMessage,
    };
  }

  const errMsg = res.returnMessage ?? `HTTP ${res.status}`;
  console.error("[cielo-refund] void falhou, enfileirando", { orderId: ctx.orderId, errMsg });

  // Não duplica fila para o mesmo pedido
  const { data: existing } = await supabaseAdmin
    .from("cielo_refund_queue")
    .select("id")
    .eq("order_id", ctx.orderId)
    .in("status", ["pending", "processing"])
    .maybeSingle();

  if (existing) {
    return { ok: false, queued: true, error: errMsg, insufficientBalance: !!res.insufficientBalance };
  }

  const { error: qErr } = await supabaseAdmin.from("cielo_refund_queue").insert({
    order_id: ctx.orderId,
    cielo_payment_id: ctx.cieloPaymentId,
    amount: ctx.amount,
    is_full: ctx.isFull,
    reason: ctx.reason,
    customer_name: ctx.customerName ?? null,
    customer_email: ctx.customerEmail ?? null,
    customer_phone: ctx.customerPhone ?? null,
    customer_cpf: ctx.customerCpf ?? null,
    payment_method: ctx.paymentMethod ?? null,
    order_total: ctx.orderTotal ?? null,
    order_created_at: ctx.orderCreatedAt ?? null,
    items: (ctx.items ?? []) as never,
    operator_id: ctx.operatorId ?? null,
    operator_name: ctx.operatorName ?? null,
    status: "pending",
    last_error: errMsg,
    last_error_code: res.returnCode ?? null,
    // Saldo insuficiente = tenta de novo em D+1; erro transitório = 1h
    next_attempt_at: new Date(
      Date.now() + (res.insufficientBalance ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000),
    ).toISOString(),
  } as never);

  if (qErr) {
    console.error("[cielo-refund] falha ao enfileirar", qErr);
    return { ok: false, queued: false, error: `${errMsg} (e a fila falhou: ${qErr.message})` };
  }

  // Sinaliza no pedido para o operador acompanhar
  await supabaseAdmin
    .from("orders")
    .update({ refund_status: "refund_queued" } as never)
    .eq("id", ctx.orderId);

  return { ok: false, queued: true, error: errMsg, insufficientBalance: !!res.insufficientBalance };
}
