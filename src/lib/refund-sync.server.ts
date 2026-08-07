// Server-only: acompanha o estado REAL dos estornos da Asaas.
//
// A devolução Pix é assíncrona: a API responde na hora (PENDING /
// AWAITING_CUSTOMER_EXTERNAL_AUTHORIZATION), mas o banco do cliente pode
// CANCELAR a devolução depois — e o dinheiro volta para o saldo da conta.
// Sem esse acompanhamento o admin mostrava "reembolsado" para estornos que
// nunca chegaram ao cliente. Aqui reconsultamos a Asaas e marcamos o refund
// como confirmed / cancelled, notificando o admin quando falha.

export type RefundSyncSummary = {
  scanned: number;
  confirmed: number;
  cancelled: number;
  stillPending: number;
  errors: number;
};

export async function syncPendingRefunds(maxAgeDays = 30): Promise<RefundSyncSummary> {
  const summary: RefundSyncSummary = {
    scanned: 0,
    confirmed: 0,
    cancelled: 0,
    stillPending: 0,
    errors: 0,
  };
  if (!process.env.ASAAS_API_KEY) return summary;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { listPaymentRefunds, mapRefundStatus } = await import("@/lib/asaas.server");

  const sinceIso = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("refunds")
    .select("id, order_id, amount, customer_name, provider_payment_id, created_at")
    .eq("status", "pending")
    .gte("created_at", sinceIso)
    .limit(200);
  if (error) {
    console.error("[refund:sync] query error", error);
    summary.errors++;
    return summary;
  }

  const rows = (data ?? []) as Array<{
    id: string;
    order_id: string;
    amount: number;
    customer_name: string | null;
    provider_payment_id: string | null;
  }>;
  summary.scanned = rows.length;

  for (const r of rows) {
    if (!r.provider_payment_id) {
      summary.stillPending++;
      continue;
    }
    try {
      const refunds = await listPaymentRefunds(r.provider_payment_id);
      if (refunds.length === 0) {
        // A Asaas removeu o estorno da cobrança: devolução cancelada.
        await markCancelled(supabaseAdmin, r, "Estorno não consta mais na cobrança da Asaas");
        summary.cancelled++;
        continue;
      }
      const latest = refunds[refunds.length - 1]!;
      const status = mapRefundStatus(latest.status);
      const nowIso = new Date().toISOString();
      if (status === "confirmed") {
        await supabaseAdmin
          .from("refunds")
          .update({
            status: "confirmed",
            provider_status: latest.status,
            confirmed_at: nowIso,
            cancelled_at: null,
            failure_reason: null,
            last_checked_at: nowIso,
          } as never)
          .eq("id", r.id);
        summary.confirmed++;
      } else if (status === "cancelled") {
        await markCancelled(supabaseAdmin, r, `Asaas cancelou a devolução (${latest.status})`, latest.status);
        summary.cancelled++;
      } else {
        await supabaseAdmin
          .from("refunds")
          .update({ provider_status: latest.status, last_checked_at: nowIso } as never)
          .eq("id", r.id);
        summary.stillPending++;
      }
    } catch (err) {
      console.error("[refund:sync] error", r.id, err);
      summary.errors++;
    }
  }

  console.info("[refund:sync] done", summary);
  return summary;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function markCancelled(
  admin: any,
  r: { id: string; order_id: string; amount: number; customer_name: string | null },
  reason: string,
  providerStatus?: string,
): Promise<void> {
  const nowIso = new Date().toISOString();
  await admin
    .from("refunds")
    .update({
      status: "cancelled",
      provider_status: providerStatus ?? "CANCELLED",
      cancelled_at: nowIso,
      confirmed_at: null,
      failure_reason: reason,
      last_checked_at: nowIso,
    })
    .eq("id", r.id);

  try {
    await admin.from("admin_notifications").insert({
      type: "refund_cancelled",
      title: "Estorno cancelado pelo banco",
      body: `${r.customer_name ?? "Cliente"} — R$ ${Number(r.amount).toFixed(2)} não foi devolvido. ${reason}`,
      order_id: null,
      metadata: { refund_id: r.id, order_id: r.order_id, amount: r.amount },
    });
  } catch (err) {
    console.error("[refund:sync] notification error", err);
  }
}

/** Atualiza um refund a partir de um evento de estorno do webhook Asaas. */
export async function applyRefundWebhookEvent(
  paymentId: string,
  event: string,
): Promise<void> {
  if (!paymentId) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("refunds")
    .select("id, order_id, amount, customer_name")
    .eq("provider_payment_id", paymentId)
    .order("created_at", { ascending: false })
    .limit(1);
  const r = (data ?? [])[0] as
    | { id: string; order_id: string; amount: number; customer_name: string | null }
    | undefined;
  if (!r) return;

  const nowIso = new Date().toISOString();
  if (event === "PAYMENT_REFUNDED") {
    await supabaseAdmin
      .from("refunds")
      .update({
        status: "confirmed",
        provider_status: "DONE",
        confirmed_at: nowIso,
        cancelled_at: null,
        failure_reason: null,
        last_checked_at: nowIso,
      } as never)
      .eq("id", r.id);
  } else if (event === "PAYMENT_REFUND_CANCELLED" || event === "PAYMENT_REFUND_FAILED") {
    await markCancelled(supabaseAdmin, r, "Devolução cancelada/rejeitada pelo banco do cliente", "CANCELLED");
  } else if (event === "PAYMENT_REFUND_IN_PROGRESS") {
    await supabaseAdmin
      .from("refunds")
      .update({ provider_status: "PENDING", last_checked_at: nowIso } as never)
      .eq("id", r.id);
  }
}
