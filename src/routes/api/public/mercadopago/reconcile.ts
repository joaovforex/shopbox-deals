import { createFileRoute } from "@tanstack/react-router";
import { safeCompare } from "@/lib/safe-compare.server";
import { enforceCronIpAllowlist } from "@/lib/ip-allowlist.server";

/**
 * Reconciliação periódica dos pedidos pagos pelo Mercado Pago.
 *
 * Varre pedidos `pending` (e cancelados por expiração) das últimas 24h,
 * reconsulta o MP pelo external_reference e finaliza como pago quando houver
 * um pagamento `approved`. Rede de segurança caso o webhook falhe/perca.
 *
 * Autenticação: header `x-cron-secret` + IP allowlist.
 */
export const Route = createFileRoute("/api/public/mercadopago/reconcile")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provided = request.headers.get("x-cron-secret") ?? "";
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: secretRow } = await supabaseAdmin
          .from("app_secrets" as never)
          .select("value")
          .eq("name", "cron_secret")
          .maybeSingle();
        const expected = (secretRow as { value?: string } | null)?.value ?? "";
        if (!expected || !safeCompare(provided, expected)) {
          return new Response("unauthorized", { status: 401 });
        }

        const gate = await enforceCronIpAllowlist(request, "mercadopago-reconcile");
        if (!gate.ok) return gate.response;

        if (!process.env.MP_ACCESS_TOKEN) {
          console.error("[mp:reconcile] missing credentials");
          return new Response("config", { status: 500 });
        }

        const { searchPaymentsByExternalReference, mapMpStatus } = await import("@/lib/mercadopago.server");

        let expired = 0;
        try {
          const { data: expiredCount, error: expireErr } = await supabaseAdmin.rpc(
            "expire_stale_pending_orders" as never,
            { p_minutes: 30 } as never,
          );
          if (expireErr) console.error("[mp:reconcile] expire error", expireErr);
          else expired = Number(expiredCount ?? 0);
        } catch (err) {
          console.error("[mp:reconcile] expire unexpected", err);
        }

        const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: orders, error } = await supabaseAdmin
          .from("orders")
          .select("id, status, total, delivery_fee, cancellation_reason")
          .eq("payment_provider", "mercadopago")
          .in("status", ["pending", "cancelled"])
          .gte("created_at", sinceIso)
          .order("created_at", { ascending: false })
          .limit(200);
        if (error) {
          console.error("[mp:reconcile] query error", error);
          return new Response("query failed", { status: 500 });
        }

        const summary = { scanned: orders?.length ?? 0, expired, recovered: 0, stillOpen: 0, errors: 0 };

        for (const row of orders ?? []) {
          const o = row as {
            id: string;
            status: string;
            total: number | null;
            delivery_fee: number | null;
            cancellation_reason: string | null;
          };
          if (o.status === "cancelled" && o.cancellation_reason !== "expired") {
            summary.stillOpen++;
            continue;
          }
          try {
            const payments = await searchPaymentsByExternalReference(o.id);
            const approved = payments.find((p) => mapMpStatus(p.status).order_action === "paid");
            if (!approved) {
              summary.stillOpen++;
              continue;
            }

            // Confere o valor pago contra o total do pedido antes de confirmar.
            const expectedTotal = Number(o.total ?? 0);
            if (approved.amount != null && expectedTotal > 0 && Math.abs(approved.amount - expectedTotal) > 0.02) {
              console.warn("[mp:reconcile] value mismatch", { orderId: o.id, paid: approved.amount, expectedTotal });
              summary.stillOpen++;
              continue;
            }

            const { data: result, error: rpcErr } = await supabaseAdmin.rpc(
              "confirm_order_paid" as never,
              { p_order_id: o.id, p_mp_payment_id: approved.id } as never,
            );
            if (rpcErr) {
              console.error("[mp:reconcile] confirm error", o.id, rpcErr);
              summary.errors++;
              continue;
            }

            await supabaseAdmin
              .from("orders")
              .update({
                mp_payment_id: approved.id,
                mp_payment_status: "approved",
                mp_payment_method_id: approved.paymentMethodId ?? null,
                mp_last_attempt_at: new Date().toISOString(),
              } as never)
              .eq("id", o.id);

            if (result === "ok" || result === "already_paid") {
              summary.recovered++;
              try {
                const { createDeliveryForOrder } = await import("@/lib/maisentregas.functions");
                await createDeliveryForOrder(o.id);
              } catch (err) {
                console.error("[mp:reconcile] maisentregas create error", o.id, err);
              }
            } else {
              summary.errors++;
              console.warn("[mp:reconcile] cannot auto-confirm", { orderId: o.id, reason: result });
            }
          } catch (err) {
            console.error("[mp:reconcile] unexpected", o.id, err);
            summary.errors++;
          }
        }

        return new Response(JSON.stringify(summary), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
