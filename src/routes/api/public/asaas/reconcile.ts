import { createFileRoute } from "@tanstack/react-router";
import { safeCompare } from "@/lib/safe-compare.server";
import { enforceCronIpAllowlist } from "@/lib/ip-allowlist.server";

/**
 * Reconciliação periódica dos pedidos pagos pela Asaas.
 *
 * Rede de segurança para webhooks que não chegam: varre pedidos `pending`
 * das últimas 24h e reconsulta a Asaas pela cobrança (por id ou por
 * externalReference). Se houver cobrança recebida/confirmada, finaliza o
 * pedido como pago.
 *
 * Autenticação: header `x-cron-secret` + IP allowlist.
 */
export const Route = createFileRoute("/api/public/asaas/reconcile")({
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

        const gate = await enforceCronIpAllowlist(request, "asaas-reconcile");
        if (!gate.ok) return gate.response;

        if (!process.env.ASAAS_API_KEY) {
          console.error("[asaas:reconcile] missing ASAAS_API_KEY");
          return new Response("config", { status: 500 });
        }

        const { getPayment, listPaymentsByReference } = await import("@/lib/asaas.server");

        const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: orders, error } = await supabaseAdmin
          .from("orders")
          .select("id, status, cancellation_reason, asaas_payment_id")
          .eq("payment_provider", "asaas")
          .in("status", ["pending", "cancelled"])
          .gte("created_at", sinceIso)
          .order("created_at", { ascending: false })
          .limit(200);
        if (error) {
          console.error("[asaas:reconcile] query error", error);
          return new Response("query failed", { status: 500 });
        }

        const PAID = new Set(["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"]);
        const summary = { scanned: orders?.length ?? 0, recovered: 0, stillOpen: 0, errors: 0 };

        for (const row of orders ?? []) {
          const o = row as { id: string; asaas_payment_id: string | null };
          try {
            let paymentId = o.asaas_payment_id ?? "";
            let status = "";
            if (paymentId) {
              const p = await getPayment(paymentId);
              status = p.status;
            } else {
              const list = await listPaymentsByReference(o.id);
              const paid = list.find((p) => PAID.has(p.status));
              if (paid) {
                paymentId = paid.id;
                status = paid.status;
              }
            }

            if (!PAID.has(status)) {
              summary.stillOpen++;
              continue;
            }

            const { data: result, error: rpcErr } = await supabaseAdmin.rpc(
              "confirm_order_paid" as never,
              { p_order_id: o.id, p_mp_payment_id: paymentId || o.id } as never,
            );
            if (rpcErr) {
              console.error("[asaas:reconcile] confirm error", o.id, rpcErr);
              summary.errors++;
              continue;
            }
            await supabaseAdmin
              .from("orders")
              .update({ asaas_payment_id: paymentId || null, asaas_status: status } as never)
              .eq("id", o.id);

            if (result === "ok" || result === "already_paid") {
              summary.recovered++;
              try {
                const { createDeliveryForOrder } = await import("@/lib/maisentregas.functions");
                await createDeliveryForOrder(o.id);
              } catch (err) {
                console.error("[asaas:reconcile] maisentregas create error", o.id, err);
              }
            } else {
              summary.errors++;
              console.warn("[asaas:reconcile] cannot auto-confirm", { orderId: o.id, reason: result });
            }
          } catch (err) {
            console.error("[asaas:reconcile] unexpected", o.id, err);
            summary.errors++;
          }
        }

        console.info("[asaas:reconcile] done", summary);
        return Response.json({ ok: true, summary });
      },
    },
  },
});
