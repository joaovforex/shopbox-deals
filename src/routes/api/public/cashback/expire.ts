import { createFileRoute } from "@tanstack/react-router";
import { safeCompare } from "@/lib/safe-compare.server";
import { enforceCronIpAllowlist } from "@/lib/ip-allowlist.server";



/**
 * Cron: expira cashback vencido (>30 dias após emissão).
 * Recomendado rodar a cada hora via pg_cron.
 */
export const Route = createFileRoute("/api/public/cashback/expire")({
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

        const gate = await enforceCronIpAllowlist(request, "cashback-expire");
        if (!gate.ok) return gate.response;


        const { data, error } = await supabaseAdmin.rpc("expire_cashback" as never);
        if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        return new Response(JSON.stringify({ expired: data ?? 0 }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
