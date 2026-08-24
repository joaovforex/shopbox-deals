import { createFileRoute } from "@tanstack/react-router";
import { safeCompare } from "@/lib/safe-compare.server";
import { enforceCronIpAllowlist } from "@/lib/ip-allowlist.server";

/**
 * Reconciliação periódica dos pedidos pagos pela Cielo.
 *
 * Varre pedidos `pending` (e cancelados por expiração) das últimas 24h,
 * reconsulta a Cielo pelo order_number e finaliza como pago quando a
 * transação estiver aprovada. Também dispara a entrega (TBT/MaisEntregas).
 *
 * Autenticação: header `x-cron-secret` + IP allowlist.
 */
export const Route = createFileRoute("/api/public/cielo/reconcile")({
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

        const gate = await enforceCronIpAllowlist(request, "cielo-reconcile");
        if (!gate.ok) return gate.response;

        if (!process.env.CIELO_CLIENT_ID || !process.env.CIELO_CLIENT_SECRET) {
          console.error("[cielo:reconcile] missing credentials");
          return new Response("config", { status: 500 });
        }

        const { getOrderByOrderNumber, mapCieloStatus } = await import("@/lib/cielo.server");

        let expired = 0;
        try {
          const { data: expiredCount, error: expireErr } = await supabaseAdmin.rpc(
            "expire_stale_pending_orders" as never,
            { p_minutes: 30 } as never,
          );
          if (expireErr) console.error("[cielo:reconcile] expire error", expireErr);
          else expired = Number(expiredCount ?? 0);
        } catch (err) {
          console.error("[cielo:reconcile] expire unexpected", err);
        }

        const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: orders, error } = await supabaseAdmin
          .from("orders")
          .select("id, status, total, delivery_fee, cancellation_reason, cielo_payment_id")
          .eq("payment_provider", "cielo")
          .in("status", ["pending", "cancelled"])
          .gte("created_at", sinceIso)
          .order("created_at", { ascending: false })
          .limit(200);
        if (error) {
          console.error("[cielo:reconcile] query error", error);
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
            cielo_payment_id: string | null;
          };
          if (o.status === "cancelled" && o.cancellation_reason !== "expired") {
            summary.stillOpen++;
            continue;
          }
          // A Cielo devolve apenas o valor dos itens do carrinho (sem o frete).
          const expectedTotal = Math.max(0, Number(o.total ?? 0) - Number(o.delivery_fee ?? 0));
          try {
            const tx = await getOrderByOrderNumber(o.id);
            if (!tx) {
              summary.stillOpen++;
              continue;
            }
            const mapped = mapCieloStatus(tx.status);
            if (mapped.order_action !== "paid") {
              await supabaseAdmin
                .from("orders")
                .update({
                  cielo_status: mapped.cielo_status,
                  cielo_last_check_at: new Date().toISOString(),
                } as never)
                .eq("id", o.id);
              summary.stillOpen++;
              continue;
            }

            // Confere o valor cobrado (centavos) antes de confirmar.
            const paidValue = tx.amount != null ? Number(tx.amount) / 100 : null;
            if (paidValue != null && expectedTotal > 0 && Math.abs(paidValue - expectedTotal) > 0.02) {
              console.warn("[cielo:reconcile] value mismatch", { orderId: o.id, paidValue, expectedTotal });
              summary.stillOpen++;
              continue;
            }

            const paymentId = tx.checkoutOrderNumber || o.cielo_payment_id || o.id;
            const { data: result, error: rpcErr } = await supabaseAdmin.rpc(
              "confirm_order_paid" as never,
              { p_order_id: o.id, p_mp_payment_id: paymentId } as never,
            );
            if (rpcErr) {
              console.error("[cielo:reconcile] confirm error", o.id, rpcErr);
              summary.errors++;
              continue;
            }

            await supabaseAdmin
              .from("orders")
              .update({
                cielo_payment_id: paymentId,
                cielo_status: "paid",
                cielo_tid: tx.tid ?? null,
                cielo_authorization_code: tx.authorizationCode ?? null,
                cielo_payment_method: tx.paymentType ?? null,
                cielo_installments: tx.installments ?? null,
                cielo_last_check_at: new Date().toISOString(),
              } as never)
              .eq("id", o.id);

            if (result === "ok" || result === "already_paid") {
              summary.recovered++;
              try {
                const { createDeliveryForOrder } = await import("@/lib/maisentregas.functions");
                await createDeliveryForOrder(o.id);
              } catch (err) {
                console.error("[cielo:reconcile] maisentregas create error", o.id, err);
              }
            } else {
              summary.errors++;
              console.warn("[cielo:reconcile] cannot auto-confirm", { orderId: o.id, reason: result });
            }
          } catch (err) {
            console.error("[cielo:reconcile] unexpected", o.id, err);
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
