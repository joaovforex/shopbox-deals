import { supabase } from "@/integrations/supabase/client";

/**
 * Registra uma ação sensível do painel admin em `admin_audit_log`.
 * Falha silenciosa — nunca deve bloquear a operação principal.
 * Leitura restrita a admin/manager via RLS.
 */
export async function logAudit(input: {
  action: string;
  entity: string;
  entity_id?: string | null;
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes?.user;
    if (!user) return;
    const userName =
      (user.user_metadata as Record<string, unknown> | undefined)?.full_name as
        | string
        | undefined;
    await supabase.from("admin_audit_log").insert({
      user_id: user.id,
      user_name: userName ?? user.email ?? null,
      action: input.action,
      entity: input.entity,
      entity_id: input.entity_id ?? null,
      details: (input.details ?? {}) as never,
    } as never);
  } catch {
    // não propaga
  }
}
