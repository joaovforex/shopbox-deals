import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Found = { id: string; full_name: string | null; email: string | null };

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

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

    const results = new Map<string, Found>();

    // Busca por nome em profiles
    const { data: byName } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name")
      .ilike("full_name", `%${data.term}%`)
      .limit(10);
    for (const p of byName ?? []) {
      results.set(p.id, { id: p.id, full_name: p.full_name, email: null });
    }

    // Busca por email em auth.users
    const term = data.term.toLowerCase();
    const { data: list, error: lErr } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (lErr) throw new Error(lErr.message);
    const matches = (list?.users ?? []).filter((u) =>
      (u.email ?? "").toLowerCase().includes(term),
    );

    if (matches.length > 0) {
      const ids = matches.map((u) => u.id);
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name")
        .in("id", ids);
      const nameMap = new Map((profs ?? []).map((p) => [p.id, p.full_name]));
      for (const u of matches) {
        const existing = results.get(u.id);
        if (existing) existing.email = u.email ?? null;
        else
          results.set(u.id, {
            id: u.id,
            full_name: nameMap.get(u.id) ?? null,
            email: u.email ?? null,
          });
      }
    }

    // Preenche emails para os encontrados por nome
    const missingEmail = [...results.values()].filter((r) => !r.email);
    if (missingEmail.length > 0) {
      for (const r of missingEmail) {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(r.id);
        if (u?.user?.email) r.email = u.user.email;
      }
    }

    return [...results.values()].slice(0, 10);
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
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.user_id, role: data.role });
    if (error) {
      if ((error as any).code === "23505") return { ok: false as const, reason: "duplicate" };
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
