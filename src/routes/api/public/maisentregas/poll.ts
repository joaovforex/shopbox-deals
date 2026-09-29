import { createFileRoute } from "@tanstack/react-router";
import { safeCompare } from "@/lib/safe-compare.server";
import { enforceCronIpAllowlist } from "@/lib/ip-allowlist.server";


/**
 * Cron de polling de status da Mais Entregas.
 * Roda a cada 10 minutos via pg_cron. Para cada pedido de delivery com
 * `maisentregas_order_id` cujo status NÃO é final, busca o status atual e
 * atualiza no banco. Quando o status indica entregue, marca o pedido como
 * fulfillment_status='completed'.
 *
 * Também tenta criar a corrida (createDeliveryForOrder) para pedidos pagos
 * de entrega que ainda não têm `maisentregas_order_id` — rede de segurança
 * caso o webhook MP tenha falhado.
 */
export const Route = createFileRoute("/api/public/maisentregas/poll")({
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

        const gate = await enforceCronIpAllowlist(request, "maisentregas-poll");
        if (!gate.ok) return gate.response;


        const { createDeliveryForOrder, pollOrderStatus } = await import("@/lib/maisentregas.functions");

        const summary = { created: 0, polled: 0, errors: 0, authFailed: false };

        // 1) Pedidos pagos de delivery sem corrida criada — tenta criar agora.
        // Janela de 7 dias: pedidos convertidos de retirada para entrega podem
        // ficar dias em preparo antes de ficarem prontos para despacho.
        const sinceIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

        // Entrega de CARRO sem serviço configurado na API é manual (a
        // expedição vincula a OS) — não ocupa vaga no lote.
        const me = await import("@/lib/maisentregas.server");
        const carCfg = await me.getCarDeliveryConfig();
        let pendingQuery = supabaseAdmin
          .from("orders")
          .select("id")
          .eq("status", "paid")
          .eq("delivery_method", "delivery")
          .is("maisentregas_order_id", null)
          .gte("created_at", sinceIso);
        if (!carCfg.meCity) pendingQuery = pendingQuery.neq("delivery_vehicle", "carro");
        const { data: pendingCreate } = await pendingQuery.limit(50);
        for (const o of pendingCreate ?? []) {
          try {
            const r = await createDeliveryForOrder(o.id);
            if (r.ok) summary.created++;
          } catch (err) {
            summary.errors++;
            console.error("[me:poll] create error", o.id, err);
          }
        }

        // 2) Pedidos com corrida ativa — atualiza status.
        // O status é gravado NORMALIZADO ('entregue' / 'cancelado' / ...), então
        // este filtro realmente exclui as corridas finalizadas. Ordena pelas
        // consultadas há mais tempo para nenhuma corrida ficar sem atualização.
        const { data: active } = await supabaseAdmin
          .from("orders")
          .select("id, maisentregas_order_id")
          .not("maisentregas_order_id", "is", null)
          .or("maisentregas_status.is.null,maisentregas_status.not.in.(entregue,cancelado,devolvido)")
          // Ignora corridas que a API rejeita por falta de acesso (OS de
          // outra conta) — senão o mesmo pedido erra em todo cron.
          .or("maisentregas_last_error.is.null,maisentregas_last_error.not.ilike.[sem-acesso]%")
          .order("maisentregas_last_check_at", { ascending: true, nullsFirst: true })
          .limit(100);
        for (const o of active ?? []) {
          try {
            const r = await pollOrderStatus(o.id, o.maisentregas_order_id!);
            if (r.ok) summary.polled++;
            else summary.errors++;
            if (r.authFailed) {
              // Credencial global recusada: todas as demais também falhariam.
              // Interrompe o lote e tenta de novo no próximo cron.
              console.error("[me:poll] credencial da Mais Entregas recusada — lote interrompido");
              summary.authFailed = true;
              break;
            }
          } catch (err) {
            summary.errors++;
            console.error("[me:poll] poll error", o.id, err);
          }
        }

        console.info("[me:poll] done", summary);
        return Response.json({ ok: true, summary });
      },
    },
  },
});
