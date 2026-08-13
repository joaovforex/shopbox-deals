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

        const { getPayment, listPaymentsByReference, listPaymentsByPaymentLink } = await import(
          "@/lib/asaas.server"
        );

        // Pedidos não aprovados precisam ser cancelados para devolver
        // cashback e estoque ao cliente. Sem isso o saldo fica "preso"
        // num pedido pendente que nunca será pago.
        let expired = 0;
        try {
          const { data: expiredCount, error: expireErr } = await supabaseAdmin.rpc(
            "expire_stale_pending_orders" as never,
            { p_minutes: 30 } as never,
          );
          if (expireErr) console.error("[asaas:reconcile] expire error", expireErr);
          else expired = Number(expiredCount ?? 0);
        } catch (err) {
          console.error("[asaas:reconcile] expire unexpected", err);
        }

        const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        const { data: orders, error } = await supabaseAdmin
          .from("orders")
          .select("id, status, total, cancellation_reason, asaas_payment_id, mp_preference_id")
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
        const summary = { scanned: orders?.length ?? 0, expired, recovered: 0, stillOpen: 0, errors: 0 };

        for (const row of orders ?? []) {
          const o = row as {
            id: string;
            status: string;
            total: number | null;
            cancellation_reason: string | null;
            asaas_payment_id: string | null;
            mp_preference_id: string | null;
          };
          // Cancelados só são recuperáveis quando a expiração automática cancelou.
          if (o.status === "cancelled" && o.cancellation_reason !== "expired") {
            summary.stillOpen++;
            continue;
          }
          const expectedTotal = Number(o.total ?? 0);
          const valueMatches = (v?: number) =>
            v == null || !(expectedTotal > 0) || Math.abs(Number(v) - expectedTotal) < 0.02;
          try {
            let paymentId = o.asaas_payment_id ?? "";
            let status = "";
            if (paymentId) {
              const p = await getPayment(paymentId);
              status = p.status;
            } else {
              const list = await listPaymentsByReference(o.id);
              let paid = list.find((p) => PAID.has(p.status) && valueMatches(p.value));
              // Vendas manuais / caixa usam link de pagamento avulso, que não
              // carrega externalReference. Nesse caso reconciliamos pelo link.
              if (!paid && o.mp_preference_id) {
                const byLink = await listPaymentsByPaymentLink(o.mp_preference_id);
                paid = byLink.find((p) => PAID.has(p.status) && valueMatches(p.value));
              }
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

        // Rede de segurança dos ESTORNOS: a devolução Pix pode ser cancelada
        // pelo banco do cliente depois de criada.
        let refunds = null;
        try {
          const { syncPendingRefunds } = await import("@/lib/refund-sync.server");
          refunds = await syncPendingRefunds();
        } catch (err) {
          console.error("[asaas:reconcile] refund sync error", err);
        }

        // Auto-cura da fila de webhooks: a Asaas "interrompe" o envio após
        // uma sequência de falhas (ex.: token divergente). Enquanto estiver
        // interrompida, a confirmação só chega pela reconciliação — atrasando
        // o pedido em minutos. Reativamos automaticamente.
        let webhook: unknown = null;
        try {
          const key = process.env.ASAAS_API_KEY!;
          const res = await fetch("https://api.asaas.com/v3/webhooks", {
            headers: { access_token: key },
          });
          const list = (await res.json()) as {
            data?: Array<{ id: string; interrupted?: boolean; enabled?: boolean }>;
          };
          for (const hook of list.data ?? []) {
            if (hook.interrupted || hook.enabled === false) {
              await fetch(`https://api.asaas.com/v3/webhooks/${hook.id}`, {
                method: "PUT",
                headers: { access_token: key, "Content-Type": "application/json" },
                body: JSON.stringify({ interrupted: false, enabled: true }),
              });
              console.warn("[asaas:reconcile] webhook queue reactivated", hook.id);
              webhook = { reactivated: hook.id };
            }
          }
        } catch (err) {
          console.error("[asaas:reconcile] webhook health check error", err);
        }

        console.info("[asaas:reconcile] done", summary, refunds, webhook);
        return Response.json({ ok: true, summary, refunds, webhook });
      },
    },
  },
});
