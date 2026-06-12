import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Promove o usuário atual a admin, mas SOMENTE se ainda não houver nenhum admin no sistema.
 * Útil para o primeiro usuário se tornar o vendedor inicial sem precisar mexer no banco.
 */
export const claimFirstAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("claim_first_admin_for_user" as never, {
      p_user_id: context.userId,
    } as never);
    if (error) throw new Error(error.message);

    if (!data) {
      return { ok: false as const, reason: "already_has_admin" };
    }

    return { ok: true as const };
  });
