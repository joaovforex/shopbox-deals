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

    const { count, error: cErr } = await supabaseAdmin
      .from("user_roles")
      .select("*", { count: "exact", head: true })
      .eq("role", "admin");
    if (cErr) throw new Error(cErr.message);

    if ((count ?? 0) > 0) {
      return { ok: false as const, reason: "already_has_admin" };
    }

    const { error: iErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: context.userId, role: "admin" });
    if (iErr) throw new Error(iErr.message);

    return { ok: true as const };
  });
