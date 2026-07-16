import { createFileRoute } from "@tanstack/react-router";

// Cron endpoint — reconcilia pedidos com pagamento Cielo pendente.
// Chamado por pg_cron via pg_net a cada 10 minutos.
// Autenticação: header apikey (Supabase publishable key). O prefixo
// /api/public/* já dispensa auth de plataforma, mas checamos a apikey
// para não expor um endpoint totalmente aberto.

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
        const { getOrder, mapCieloStatus } = await import("@/lib/cielo.server");

        // Pedidos Cielo em aberto criados nas últimas 48h
        const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
        const { data: candidates, error } = await supabaseAdmin
          .from("orders")
          .select("id, cielo_payment_id, status, cielo_status")
          .eq("payment_provider", "cielo")
          .in("status", ["pending"])
          .not("cielo_payment_id", "is", null)
          .gte("created_at", since)
          .limit(100);
        if (error) {
          console.error("[cielo:reconcile] query error", error);
          return new Response("query failed", { status: 500 });
        }

        let checked = 0;
        let updated = 0;
        for (const row of candidates ?? []) {
          const r = row as { id: string; cielo_payment_id: string };
          try {
            const cielo = await getOrder(r.cielo_payment_id);
            if (!cielo) continue;
            checked++;

            const { cielo_status, order_action } = mapCieloStatus(cielo.status);

            await supabaseAdmin
              .from("orders")
              .update({
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
                { p_order_id: r.id, p_mp_payment_id: r.cielo_payment_id } as never,
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

        return new Response(JSON.stringify({ checked, updated, candidates: candidates?.length ?? 0 }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
