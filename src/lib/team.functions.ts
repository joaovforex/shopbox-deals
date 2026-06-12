import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Found = { id: string; full_name: string | null; email: string | null };

export const searchTeamCandidates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { term: string }) => {
    const term = (input?.term ?? "").trim();
    if (term.length < 2 || term.length > 120) throw new Error("Termo inválido");
    return { term };
  })
  .handler(async ({ data, context }): Promise<Found[]> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: results, error } = await supabaseAdmin.rpc("admin_search_team_candidates" as never, {
      p_term: data.term,
    } as never);
    if (error) throw new Error(error.message);
    return (results ?? []) as Found[];
  });

export const assignTeamRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { user_id: string; role: "admin" | "catalog" | "fulfillment" }) => {
    if (!input?.user_id) throw new Error("user_id obrigatório");
    if (!["admin", "catalog", "fulfillment"].includes(input.role))
      throw new Error("Função inválida");
    return input;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existingUser, error: userError } = await supabaseAdmin.auth.admin.getUserById(data.user_id);
    if (userError || !existingUser?.user) throw new Error("Usuário não encontrado");
    const { error } = await supabaseAdmin.from("user_roles").insert({
      user_id: data.user_id,
      role: data.role,
    });
    if (error) {
      if (error.code === "23505") return { ok: false as const, reason: "duplicate" };
      throw new Error(error.message);
    }
    return { ok: true as const };
  });

export const removeTeamRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { user_id: string; role: "admin" | "catalog" | "fulfillment" }) => {
    if (!input?.user_id) throw new Error("user_id obrigatório");
    if (!["admin", "catalog", "fulfillment"].includes(input.role))
      throw new Error("Função inválida");
    return input;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.user_id)
      .eq("role", data.role);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data: ok, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!ok) throw new Error("Sem permissão");
}

export const adminResetPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { user_id: string; new_password: string }) => {
    if (!input?.user_id) throw new Error("user_id obrigatório");
    const pw = (input?.new_password ?? "").trim();
    if (pw.length < 8 || pw.length > 72) throw new Error("Senha deve ter entre 8 e 72 caracteres");
    return { user_id: input.user_id, new_password: pw };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      password: data.new_password,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { user_id: string }) => {
    if (!input?.user_id) throw new Error("user_id obrigatório");
    return input;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.user_id === context.userId) throw new Error("Você não pode excluir sua própria conta");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
