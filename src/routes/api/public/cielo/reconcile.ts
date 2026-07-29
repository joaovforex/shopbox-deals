import { createFileRoute } from "@tanstack/react-router";
import { safeCompare } from "@/lib/safe-compare.server";
import { enforceCronIpAllowlist } from "@/lib/ip-allowlist.server";

// Cron endpoint — reconcilia pedidos com pagamento Cielo pendente.
// Chamado por pg_cron via pg_net a cada 10 minutos.
// Autenticação: x-cron-secret (safeCompare) + IP allowlist.
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
