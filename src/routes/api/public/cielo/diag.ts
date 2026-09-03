import { createFileRoute } from "@tanstack/react-router";
import { safeCompare } from "@/lib/safe-compare.server";

/**
 * Diagnóstico temporário: devolve o payload bruto da Cielo para um pedido.
 * Protegido por `x-cron-secret`. Somente leitura.
 */
export const Route = createFileRoute("/api/public/cielo/diag")({
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

        const body = (await request.json().catch(() => ({}))) as { orderId?: string };
        if (!body.orderId) return new Response("orderId required", { status: 400 });

        const { getRawOrderByOrderNumber } = await import("@/lib/cielo.server");
        const raw = await getRawOrderByOrderNumber(body.orderId);
        return new Response(JSON.stringify({ raw }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
