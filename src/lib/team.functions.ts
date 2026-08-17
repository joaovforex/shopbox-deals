import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Found = { id: string; full_name: string | null; email: string | null };
export type TeamMember = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  roles: string[];
  unidade_id: string | null;
};

export const listTeamMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(() => ({}))
  .handler(async ({ context }): Promise<TeamMember[]> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: usersData, error: usersError }, { data: profs, error: profError }, { data: roles, error: rolesError }] = await Promise.all([
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      supabaseAdmin.from("profiles").select("id, full_name"),
      supabaseAdmin.from("user_roles").select("user_id, role"),
    ]);
    if (usersError) throw new Error(usersError.message);
    if (profError) throw new Error(profError.message);
    if (rolesError) throw new Error(rolesError.message);

    const profileById = new Map((profs ?? []).map((p) => [p.id, p.full_name]));
    const rolesById = new Map<string, string[]>();
    for (const r of roles ?? []) {
      const arr = rolesById.get(r.user_id) ?? [];
      arr.push(r.role as string);
      rolesById.set(r.user_id, arr);
    }
    return (usersData?.users ?? []).map((u) => ({
      user_id: u.id,
      full_name: profileById.get(u.id) ?? (u.user_metadata?.full_name as string | undefined) ?? null,
      email: u.email ?? null,
      roles: rolesById.get(u.id) ?? ["user"],
    }));
  });

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

const INTERNAL_ROLES = ["admin", "manager", "catalog", "fulfillment", "cashier"] as const;
type InternalRole = (typeof INTERNAL_ROLES)[number];

export const assignTeamRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { user_id: string; role: InternalRole }) => {
    if (!input?.user_id) throw new Error("user_id obrigatório");
    if (!(INTERNAL_ROLES as readonly string[]).includes(input.role))
      throw new Error("Função inválida");
    return input;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existingUser, error: userError } = await supabaseAdmin.auth.admin.getUserById(data.user_id);
    if (userError || !existingUser?.user) throw new Error("Usuário não encontrado");
    // Troca dinâmica: remove todos os cargos internos anteriores antes de atribuir o novo.
    const { error: delErr } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.user_id)
      .in("role", INTERNAL_ROLES as unknown as never);
    if (delErr) throw new Error(delErr.message);
    const { error } = await supabaseAdmin.from("user_roles").insert({
      user_id: data.user_id,
      role: data.role as never,
    });
    if (error) {
      if (error.code === "23505") return { ok: false as const, reason: "duplicate" };
      throw new Error(error.message);
    }
    return { ok: true as const };
  });

export const removeTeamRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { user_id: string; role: InternalRole }) => {
    if (!input?.user_id) throw new Error("user_id obrigatório");
    if (!(INTERNAL_ROLES as readonly string[]).includes(input.role))
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
      .eq("role", data.role as never);
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
    if (error) {
      const msg = error.message ?? "";
      if (/foreign key|violates|constraint|database error/i.test(msg)) {
        throw new Error(
          "Não foi possível excluir: a conta ainda está vinculada a registros do sistema (pedidos, estornos ou etiquetas). Remova o cargo dela ou fale com o suporte.",
        );
      }
      throw new Error(msg || "Falha ao excluir usuário");
    }
    return { ok: true };
  });

