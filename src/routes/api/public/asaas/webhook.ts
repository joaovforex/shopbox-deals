import { createFileRoute } from "@tanstack/react-router";
import { safeCompare } from "@/lib/safe-compare.server";

const PAID_EVENTS = new Set(["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"]);
const CANCEL_EVENTS = new Set([
  "PAYMENT_OVERDUE",
  "PAYMENT_DELETED",
  "PAYMENT_REFUNDED",
  "PAYMENT_CHARGEBACK",
  "PAYMENT_REFUND_REQUESTED",
]);

export const Route = createFileRoute("/api/public/asaas/webhook")({
  server: {
    handlers: {
      GET: async () => new Response("ok"),
      POST: async ({ request }) => {
        try {
          const expected = process.env.ASAAS_WEBHOOK_TOKEN;
          if (!expected) {
            console.error("[asaas:webhook] missing ASAAS_WEBHOOK_TOKEN");
            return new Response("config", { status: 500 });
          }
          const token = request.headers.get("asaas-access-token") ?? "";
          if (!safeCompare(token, expected)) {
            console.warn("[asaas:webhook] invalid token");
            return new Response("unauthorized", { status: 401 });
          }

          const payload = (await request.json().catch(() => null)) as
            | {
                event?: string;
                payment?: { id?: string; externalReference?: string | null; status?: string };
              }
            | null;

          const event = payload?.event ?? "";
          const payment = payload?.payment;
          const orderId = payment?.externalReference ?? "";
          const paymentId = payment?.id ?? "";

          if (!event || !orderId) {
            return new Response("ok", { status: 200 });
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          await supabaseAdmin
            .from("orders")
            .update({
              asaas_status: payment?.status ?? event,
              asaas_payment_id: paymentId || null,
            } as never)
            .eq("id", orderId);

          if (PAID_EVENTS.has(event)) {
            const { data: result, error } = await supabaseAdmin.rpc(
              "confirm_order_paid" as never,
              { p_order_id: orderId, p_mp_payment_id: paymentId } as never,
            );
            if (error) console.error("[asaas:webhook] confirm_order_paid error", error);
            else console.info("[asaas:webhook] order confirmed", { orderId, result });
          } else if (CANCEL_EVENTS.has(event)) {
            // O trigger restore_stock_on_cancel cuida da devolução de estoque.
            const { error } = await supabaseAdmin
              .from("orders")
              .update({ status: "cancelled", cancellation_reason: `asaas:${event}` } as never)
              .eq("id", orderId)
              .eq("status", "pending");
            if (error) console.error("[asaas:webhook] cancel error", error);
          }

          return new Response("ok", { status: 200 });
        } catch (err) {
          console.error("[asaas:webhook] unexpected error", err);
          return new Response("ok", { status: 200 });
        }
      },
    },
  },
});
