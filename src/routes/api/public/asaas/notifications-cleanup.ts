import { createFileRoute } from "@tanstack/react-router";
import { safeCompare } from "@/lib/safe-compare.server";
import { enforceCronIpAllowlist } from "@/lib/ip-allowlist.server";

/**
 * Ajuste único (manual): aplica a "Opção B" de notificações da Asaas em TODOS
 * os clientes já existentes — só e-mail de PAYMENT_RECEIVED, resto desligado.
 * Idempotente: clientes já corretos não geram chamada de atualização.
 * Não há agendamento recorrente; dispare manualmente com o x-cron-secret.
 */
export const Route = createFileRoute("/api/public/asaas/notifications-cleanup")({
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

        const gate = await enforceCronIpAllowlist(request, "asaas-notifications-cleanup");
        if (!gate.ok) return gate.response;

        const { listCustomers, applyEmailOnlyNotifications } = await import("@/lib/asaas.server");

        const url = new URL(request.url);
        const startOffset = Math.max(0, Number(url.searchParams.get("offset") ?? 0) || 0);
        const maxCustomers = Math.min(
          5000,
          Math.max(1, Number(url.searchParams.get("max") ?? 1000) || 1000),
        );

        let offset = startOffset;
        let scanned = 0;
        let updated = 0;
        let alreadyOk = 0;
        let failed = 0;
        let hasMore = true;

        while (hasMore && scanned < maxCustomers) {
          let page: { ids: string[]; hasMore: boolean };
          try {
            page = await listCustomers(offset, 100);
          } catch (err) {
            console.error("[asaas:notif-cleanup] list failed", offset, err);
            break;
          }
          if (page.ids.length === 0) break;

          for (const id of page.ids) {
            scanned++;
            try {
              const changed = await applyEmailOnlyNotifications(id);
              if (changed) updated++;
              else alreadyOk++;
            } catch (err) {
              failed++;
              console.warn("[asaas:notif-cleanup] customer failed", id, err);
            }
          }

          offset += page.ids.length;
          hasMore = page.hasMore;
        }

        return new Response(
          JSON.stringify({
            scanned,
            updated,
            alreadyOk,
            failed,
            nextOffset: hasMore ? offset : null,
            done: !hasMore,
          }),
          { headers: { "content-type": "application/json" } },
        );
      },
    },
  },
});
