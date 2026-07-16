import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/cielo-refund-retry")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Autenticação via apikey (padrão pg_cron + anon key)
        const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
        const provided = request.headers.get("apikey") ?? "";
        if (!anonKey || provided !== anonKey) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        try {
          const { processCieloRefundQueue } = await import("@/lib/cielo-refund-queue.server");
          const result = await processCieloRefundQueue();
          return Response.json({ ok: true, ...result });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[cielo-refund-retry] error", msg);
          return new Response(JSON.stringify({ ok: false, error: msg }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
