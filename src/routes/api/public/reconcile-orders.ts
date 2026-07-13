import { createFileRoute } from "@tanstack/react-router";
import { safeCompare } from "@/lib/safe-compare.server";


/**
 * Reconciliação periódica de pedidos.
 *
 * Roda a cada poucos minutos (pg_cron) e varre todos os pedidos `pending`
 * ou `cancelled` das últimas 24h. Para cada um, consulta o Mercado Pago
 * por external_reference. Se encontrar QUALQUER pagamento aprovado e o
 * pedido ainda não estiver `paid`, finaliza o pedido como pago.
 *
 * Esta é a rede de segurança definitiva contra:
 * - Webhook que não chega (falha de rede, MP fora do ar)
 * - Webhook desatualizado em produção (fix novo ainda não publicado)
 * - Race conditions entre rejeição de cartão e Pix aprovado no mesmo pedido
 *
 * Autenticação: chamada por pg_cron com header `apikey` = publishable key.
 * O endpoint vive sob /api/public/ (bypassa auth do edge) e checa a key
 * manualmente para evitar abuso externo.
 */
export const Route = createFileRoute("/api/public/reconcile-orders")({
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
        if (!expected || provided.length !== expected.length || provided !== expected) {
          return new Response("unauthorized", { status: 401 });
        }

        const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
        if (!accessToken) {
          console.error("[reconcile] missing MP token");
          return new Response("config", { status: 500 });
        }


        const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        const { data: orders, error } = await supabaseAdmin
          .from("orders")
          .select("id, status, mp_payment_id, total")
          .in("status", ["pending", "cancelled"])
          .gte("created_at", sinceIso)
          .order("created_at", { ascending: false })
          .limit(200);

        if (error) {
          console.error("[reconcile] query error", error);
          return new Response("query failed", { status: 500 });
        }

        const summary = {
          scanned: orders?.length ?? 0,
          recovered: 0,
          stillOpen: 0,
          noPayment: 0,
          errors: 0,
        };
        const recovered: Array<{ orderId: string; paymentId: string; amount: number }> = [];

        for (const order of orders ?? []) {
          try {
            const url = `https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(order.id)}&sort=date_created&criteria=desc`;
            const res = await fetch(url, {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
            if (!res.ok) {
              console.warn("[reconcile] MP search failed", { orderId: order.id, status: res.status });
              summary.errors++;
              continue;
            }
            const json = (await res.json()) as {
              results?: Array<{
                id: number;
                status: string;
                transaction_amount: number;
                date_approved?: string | null;
              }>;
            };
            const approved = (json.results ?? []).find(
              (p) => p.status === "approved" && p.date_approved,
            );

            if (!approved) {
              if (order.status === "pending") summary.stillOpen++;
              else summary.noPayment++;
              continue;
            }

            // Existe pagamento aprovado mas pedido NÃO está como pago → recuperar
            const { data: result, error: rpcErr } = await supabaseAdmin.rpc(
              "confirm_order_paid" as never,
              { p_order_id: order.id, p_mp_payment_id: String(approved.id) } as never,
            );

            if (rpcErr) {
              console.error("[reconcile] confirm error", { orderId: order.id, rpcErr });
              summary.errors++;
              continue;
            }

            console.info("[reconcile] recovered", {
              orderId: order.id,
              paymentId: approved.id,
              amount: approved.transaction_amount,
              rpcResult: result,
            });

            if (result === "ok" || result === "already_paid") {
              summary.recovered++;
              recovered.push({
                orderId: order.id,
                paymentId: String(approved.id),
                amount: approved.transaction_amount,
              });
              // Se for delivery, garante que a corrida foi criada.
              try {
                const { createDeliveryForOrder } = await import("@/lib/maisentregas.functions");
                await createDeliveryForOrder(order.id);
              } catch (err) {
                console.error("[reconcile] maisentregas create error", order.id, err);
              }
            } else {
              // out_of_stock etc — registra para o operador resolver
              summary.errors++;
              console.warn("[reconcile] cannot auto-confirm", {
                orderId: order.id,
                paymentId: approved.id,
                reason: result,
              });
            }

          } catch (err) {
            console.error("[reconcile] unexpected", { orderId: order.id, err });
            summary.errors++;
          }
        }

        console.info("[reconcile] done", summary);
        return Response.json({ ok: true, summary, recovered });
      },
    },
  },
});
