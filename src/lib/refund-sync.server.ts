// Server-only: acompanha o estado REAL dos estornos da Asaas.
//
// A devolução Pix é assíncrona: a API responde na hora (PENDING /
// AWAITING_CUSTOMER_EXTERNAL_AUTHORIZATION), mas o banco do cliente pode
// CANCELAR a devolução depois — e o dinheiro volta para o saldo da conta.
// Sem esse acompanhamento o admin mostrava "reembolsado" para estornos que
// nunca chegaram ao cliente. Aqui reconsultamos a Asaas e marcamos o refund
// como confirmed / cancelled, notificando o admin quando falha.

/* eslint-disable @typescript-eslint/no-explicit-any */

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

  const rows = (data ?? []) as PendingRefundRow[];
  summary.scanned = rows.length;

  for (const r of rows) {
    if (!r.provider_payment_id) {
      summary.stillPending++;
      continue;
    }
    try {
      const outcome = await syncRefundRow(supabaseAdmin, r, {
        listPaymentRefunds,
        mapRefundStatus,
      });
      summary[outcome]++;
    } catch (err) {
      console.error("[refund:sync] error", r.id, err);
      summary.errors++;
    }
  }

  console.info("[refund:sync] done", summary);
  return summary;
}

type PendingRefundRow = {
  id: string;
  order_id: string;
  amount: number;
  customer_name: string | null;
  provider_payment_id: string | null;
};

type AsaasRefundApi = Pick<
  typeof import("@/lib/asaas.server"),
  "listPaymentRefunds" | "mapRefundStatus"
>;

/** Reconsulta a Asaas para um refund e grava o estado real. */
async function syncRefundRow(
  admin: any,
  r: PendingRefundRow,
  api: AsaasRefundApi,
): Promise<"confirmed" | "cancelled" | "stillPending"> {
  const refunds = await api.listPaymentRefunds(r.provider_payment_id!);
  if (refunds.length === 0) {
    // A Asaas removeu o estorno da cobrança: devolução cancelada.
    await markCancelled(admin, r, "Estorno não consta mais na cobrança da Asaas");
    return "cancelled";
  }
  const latest = refunds[refunds.length - 1]!;
  const status = api.mapRefundStatus(latest.status);
  const nowIso = new Date().toISOString();
  if (status === "confirmed") {
    await admin
      .from("refunds")
      .update({
        status: "confirmed",
        provider_status: latest.status,
        confirmed_at: nowIso,
        cancelled_at: null,
        failure_reason: null,
        last_checked_at: nowIso,
      })
      .eq("id", r.id);
    return "confirmed";
  }
  if (status === "cancelled") {
    await markCancelled(admin, r, `Asaas cancelou a devolução (${latest.status})`, latest.status);
    return "cancelled";
  }
  await admin
    .from("refunds")
    .update({ provider_status: latest.status, last_checked_at: nowIso })
    .eq("id", r.id);
  return "stillPending";
}

/**
 * Sincroniza o refund pendente de UMA cobrança consultando a Asaas.
 * Usado pelo webhook quando o token não confere: nesse caminho o evento do
 * payload é forjável, então só o estado remoto pode mudar o histórico.
 */
export async function syncRefundForPayment(paymentId: string): Promise<void> {
  if (!paymentId || !process.env.ASAAS_API_KEY) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { listPaymentRefunds, mapRefundStatus } = await import("@/lib/asaas.server");
  const { data } = await supabaseAdmin
    .from("refunds")
    .select("id, order_id, amount, customer_name, provider_payment_id")
    .eq("provider_payment_id", paymentId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1);
  const r = (data ?? [])[0] as PendingRefundRow | undefined;
  if (!r?.provider_payment_id) return;
  await syncRefundRow(supabaseAdmin, r, { listPaymentRefunds, mapRefundStatus });
}

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
export async function applyRefundWebhookEvent(paymentId: string, event: string): Promise<void> {
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
    await markCancelled(
      supabaseAdmin,
      r,
      "Devolução cancelada/rejeitada pelo banco do cliente",
      "CANCELLED",
    );
  } else if (event === "PAYMENT_REFUND_IN_PROGRESS") {
    await supabaseAdmin
      .from("refunds")
      .update({ provider_status: "PENDING", last_checked_at: nowIso } as never)
      .eq("id", r.id);
  }
}
