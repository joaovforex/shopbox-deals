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

        const {
          getPayment,
          listPaymentsByReference,
          listPaymentsByPaymentLink,
          listPaymentsCreatedSince,
        } = await import("@/lib/asaas.server");

        // Cache best-effort das cobranças recentes, usado só quando um pedido
        // com Asaas Checkout não casa por externalReference.
        let recentPayments: Awaited<ReturnType<typeof listPaymentsCreatedSince>> | null = null;
        const getRecentPayments = async () => {
          if (recentPayments) return recentPayments;
          try {
            const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
            recentPayments = await listPaymentsCreatedSince(since, 5);
          } catch (err) {
            console.error("[asaas:reconcile] recent payments scan error", err);
            recentPayments = [];
          }
          return recentPayments;
        };

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
          .select(
            "id, status, total, cancellation_reason, asaas_payment_id, mp_preference_id, asaas_checkout_id",
          )
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
            asaas_checkout_id: string | null;
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
              // Confere também o valor: se o id salvo não pertencer a este
              // pedido (match errado anterior), não confirmamos.
              status = valueMatches(p.value) ? p.status : "";
            } else {
              const list = await listPaymentsByReference(o.id);
              let paid = list.find((p) => PAID.has(p.status) && valueMatches(p.value));
              // Vendas manuais / caixa usam link de pagamento avulso, que não
              // carrega externalReference. Nesse caso reconciliamos pelo link.
              if (!paid && o.mp_preference_id) {
                const byLink = await listPaymentsByPaymentLink(o.mp_preference_id);
                paid = byLink.find((p) => PAID.has(p.status) && valueMatches(p.value));
              }
              // Rede de segurança do Asaas Checkout: casa pelo id da sessão,
              // e só quando bate exatamente.
              if (!paid && o.asaas_checkout_id) {
                const recent = await getRecentPayments();
                paid = recent.find(
                  (p) =>
                    p.checkoutSession === o.asaas_checkout_id &&
                    PAID.has(p.status) &&
                    valueMatches(p.value),
                );
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

        // === Conversões retirada → entrega ===
        // Mesma rede de segurança para o frete de R$12: se o webhook não
        // chegar, o pedido ficaria pago no gateway mas parado em retirada.
        const upgradeSummary = { scanned: 0, applied: 0, errors: 0 };
        try {
          const upSince = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
          const { data: ups } = await supabaseAdmin
            .from("delivery_upgrades")
            .select("id, order_id, fee, mp_preference_id")
            .eq("status", "pending")
            .not("mp_preference_id", "is", null)
            .gte("created_at", upSince)
            .limit(100);
          upgradeSummary.scanned = ups?.length ?? 0;
          for (const row of ups ?? []) {
            const u = row as { id: string; order_id: string; fee: number | null; mp_preference_id: string | null };
            try {
              const p = await getPayment(u.mp_preference_id!);
              const fee = Number(u.fee ?? 0);
              const okValue = p.value == null || !(fee > 0) || Math.abs(Number(p.value) - fee) < 0.02;
              if (!okValue || !PAID.has(p.status)) continue;
              await supabaseAdmin
                .from("delivery_upgrades")
                .update({ mp_payment_id: p.id, mp_status: p.status } as never)
                .eq("id", u.id);
              const { error: upErr } = await supabaseAdmin.rpc(
                "apply_delivery_upgrade" as never,
                { p_upgrade_id: u.id, p_mp_payment_id: p.id } as never,
              );
              if (upErr) {
                console.error("[asaas:reconcile] apply_delivery_upgrade error", u.id, upErr);
                upgradeSummary.errors++;
                continue;
              }
              upgradeSummary.applied++;
              // Se o pedido já estava separado/pronto, dispara a corrida na TBT Express.
              try {
                const { createDeliveryForOrder } = await import("@/lib/maisentregas.functions");
                await createDeliveryForOrder(u.order_id);
              } catch (err) {
                console.error("[asaas:reconcile] maisentregas upgrade dispatch error", u.order_id, err);
              }

              await supabaseAdmin.from("admin_notifications").insert({
                type: "delivery_upgrade_paid",
                title: `Upgrade para entrega confirmado #${String(u.order_id).slice(0, 8).toUpperCase()}`,
                body: "Frete pago (confirmado pela reconciliação) — pedido movido para entrega.",
                order_id: u.order_id,
                metadata: { upgrade_id: u.id, asaas_payment_id: p.id, source: "reconcile" },
              } as never);
            } catch (err) {
              console.error("[asaas:reconcile] upgrade unexpected", u.id, err);
              upgradeSummary.errors++;
            }
          }
        } catch (err) {
          console.error("[asaas:reconcile] upgrade scan error", err);
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
          const OFFICIAL_WEBHOOK_ID = "a04f86cd-af52-4781-99cc-eb3fe754c019";
          for (const hook of list.data ?? []) {
            if (hook.id !== OFFICIAL_WEBHOOK_ID) continue;
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

        console.info("[asaas:reconcile] done", summary, upgradeSummary, refunds, webhook);
        return Response.json({ ok: true, summary, upgrades: upgradeSummary, refunds, webhook });

      },
    },
  },
});
