import { createFileRoute } from "@tanstack/react-router";

// Webhook Cielo. A Cielo NÃO assina o payload — sempre reconsultamos a API
// pelo PaymentId antes de acreditar em qualquer status recebido.
// Formato esperado: { PaymentId: "uuid", ChangeType: 1|2|... }

export const Route = createFileRoute("/api/public/cielo/webhook")({
  server: {
    handlers: {
      GET: async () => new Response("ok"),
      POST: async ({ request }) => {
        let raw = "";
        let payload: { PaymentId?: string; ChangeType?: number } = {};
        try {
          raw = await request.text();
          if (raw) payload = JSON.parse(raw);
        } catch {
          return new Response("bad json", { status: 400 });
        }

        const paymentId = String(payload.PaymentId ?? "").trim();
        const changeType = Number(payload.ChangeType ?? 0);
        if (!paymentId) {
          console.warn("[cielo:webhook] payload sem PaymentId");
          return new Response("ignored", { status: 200 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { getOrder, mapCieloStatus } = await import("@/lib/cielo.server");

        // Idempotência via unique (payment_id, change_type)
        const { error: dedupErr } = await supabaseAdmin
          .from("cielo_webhook_events")
          .insert({
            payment_id: paymentId,
            change_type: changeType,
            raw_payload: payload as never,
          } as never);
        if (dedupErr) {
          // Se já existia, seguimos silenciosamente — mas ainda revalidamos
          // status pois a Cielo pode reenviar após um erro nosso.
          const msg = String(dedupErr.message ?? "");
          if (!msg.includes("duplicate key")) {
            console.error("[cielo:webhook] insert event error", dedupErr);
          }
        }

        // Fonte da verdade: consultar a Cielo
        let cielo;
        try {
          cielo = await getOrder(paymentId);
        } catch (err) {
          console.error("[cielo:webhook] getOrder falhou", err);
          return new Response("cielo fetch failed", { status: 502 });
        }
        if (!cielo) {
          console.warn("[cielo:webhook] pagamento não encontrado na Cielo", paymentId);
          return new Response("ok", { status: 200 });
        }

        const orderId = cielo.orderNumber;
        if (!orderId) {
          console.warn("[cielo:webhook] payment sem orderNumber", paymentId);
          return new Response("ok", { status: 200 });
        }

        const { cielo_status, order_action } = mapCieloStatus(cielo.status);

        // Persiste snapshot da última tentativa
        await supabaseAdmin
          .from("orders")
          .update({
            cielo_payment_id: paymentId,
            cielo_status,
            cielo_tid: cielo.tid ?? null,
            cielo_authorization_code: cielo.authorizationCode ?? null,
            cielo_return_code: cielo.returnCode ?? null,
            cielo_return_message: cielo.returnMessage ?? null,
            cielo_installments: cielo.installments ?? null,
            cielo_payment_method: normalizePaymentType(cielo.paymentType),
            cielo_last_check_at: new Date().toISOString(),
          } as never)
          .eq("id", orderId);

        // Vincula event -> order (idempotente)
        await supabaseAdmin
          .from("cielo_webhook_events")
          .update({ order_id: orderId, cielo_status: cielo.status } as never)
          .eq("payment_id", paymentId)
          .eq("change_type", changeType);

        const { data: current } = await supabaseAdmin
          .from("orders")
          .select("status")
          .eq("id", orderId)
          .maybeSingle();
        if (!current) {
          console.warn("[cielo:webhook] order not found", orderId);
          return new Response("ok", { status: 200 });
        }
        const currentStatus = (current as { status: string }).status;
        if (currentStatus === "paid" || currentStatus === "cancelled") {
          return new Response("already finalized", { status: 200 });
        }

        if (order_action === "paid") {
          const { error: rpcErr } = await supabaseAdmin.rpc(
            "confirm_order_paid" as never,
            { p_order_id: orderId, p_mp_payment_id: paymentId } as never,
          );
          if (rpcErr) {
            console.error("[cielo:webhook] confirm_order_paid error", rpcErr);
            return new Response("update failed", { status: 500 });
          }
        } else if (order_action === "cancelled") {
          const { error: updErr } = await supabaseAdmin
            .from("orders")
            .update({ status: "cancelled" } as never)
            .eq("id", orderId);
          if (updErr) {
            console.error("[cielo:webhook] cancel update error", updErr);
            return new Response("update failed", { status: 500 });
          }
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});

function normalizePaymentType(t: string | undefined): string | null {
  if (!t) return null;
  const s = t.toLowerCase();
  if (s.includes("credit")) return "credit_card";
  if (s.includes("debit")) return "debit_card";
  if (s.includes("pix")) return "pix";
  if (s.includes("boleto")) return "boleto";
  return s;
}
