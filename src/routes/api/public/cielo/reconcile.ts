import { createFileRoute } from "@tanstack/react-router";

// Cron endpoint — reconcilia pedidos com pagamento Cielo pendente.
// Chamado por pg_cron via pg_net a cada 10 minutos.
// Autenticação: header apikey (Supabase publishable key). O prefixo
// /api/public/* já dispensa auth de plataforma, mas checamos a apikey
// para não expor um endpoint totalmente aberto.
//
// Como funciona: para cada pedido "pending" Cielo criado nas últimas 48h,
// consultamos a Cielo pelo order_number (nosso próprio order.id) via
// /v2/merchantOrderNumber/{order_number} → obtemos o checkoutOrderNumber
// mais recente → consultamos os detalhes em /v2/orders/{checkoutOrderNumber}
// → aplicamos o status ao pedido local.

export const Route = createFileRoute("/api/public/cielo/reconcile")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const providedKey = request.headers.get("apikey") ?? "";
        const expectedKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
        if (!expectedKey || providedKey !== expectedKey) {
          return new Response("unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { getOrderByOrderNumber, mapCieloStatus } = await import("@/lib/cielo.server");

        const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
        const { data: candidates, error } = await supabaseAdmin
          .from("orders")
          .select("id, status, cielo_status")
          .eq("payment_provider", "cielo")
          .in("status", ["pending"])
          .gte("created_at", since)
          .limit(100);
        if (error) {
          console.error("[cielo:reconcile] query error", error);
          return new Response("query failed", { status: 500 });
        }

        let checked = 0;
        let updated = 0;
        for (const row of candidates ?? []) {
          const r = row as { id: string };
          try {
            const cielo = await getOrderByOrderNumber(r.id);
            if (!cielo) continue;
            checked++;

            const { cielo_status, order_action } = mapCieloStatus(cielo.status);

            await supabaseAdmin
              .from("orders")
              .update({
                cielo_payment_id: cielo.checkoutOrderNumber,
                cielo_status,
                cielo_tid: cielo.tid ?? null,
                cielo_authorization_code: cielo.authorizationCode ?? null,
                cielo_return_code: cielo.returnCode ?? null,
                cielo_return_message: cielo.returnMessage ?? null,
                cielo_last_check_at: new Date().toISOString(),
              } as never)
              .eq("id", r.id);

            if (order_action === "paid") {
              const { error: rpcErr } = await supabaseAdmin.rpc(
                "confirm_order_paid" as never,
                { p_order_id: r.id, p_mp_payment_id: cielo.checkoutOrderNumber } as never,
              );
              if (!rpcErr) updated++;
            } else if (order_action === "cancelled") {
              await supabaseAdmin
                .from("orders")
                .update({ status: "cancelled" } as never)
                .eq("id", r.id);
              updated++;
            }
          } catch (err) {
            console.error("[cielo:reconcile] order failed", r.id, err);
          }
        }

        return new Response(
          JSON.stringify({ checked, updated, candidates: candidates?.length ?? 0 }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
