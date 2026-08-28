import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";


export type CashbackCustomer = {
  id: string;
  name: string;
  email: string;
  phone: string;
  cpf: string;
  balance: number;
};

export type CashbackGrantRow = {
  id: string;
  user_id: string;
  name: string;
  amount: number;
  created_at: string;
  expires_at: string | null;
  reason: string;
};

async function requireAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error("Falha ao validar permissão");
  if (!isAdmin) throw new Error("Apenas SUPERADMIN pode gerenciar cashback");
}

/** Busca clientes por nome, e-mail, telefone ou CPF (ignora acento/maiúsculas). */
export const searchCashbackCustomers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { term: string }) => ({ term: String(data?.term ?? "").slice(0, 100) }))
  .handler(async ({ data, context }): Promise<CashbackCustomer[]> => {
    await requireAdmin(context as never);
    const raw = String(data.term ?? "").trim();
    if (raw.length < 2) return [];
    // Mantém @ . - _ (essenciais pra e-mail), remove só o que quebra o filtro PostgREST.
    const term = raw.replace(/[(),*%\\"'`:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
    if (term.length < 2) return [];

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const digits = term.replace(/\D/g, "");

    const ids = new Set<string>();

    // Busca por nome/e-mail ignorando acentos e maiúsculas (usa text_norm no banco).
    const { data: candidates } = await context.supabase.rpc("search_team_candidates" as never, {
      p_term: raw.slice(0, 120),
    } as never);
    for (const c of (candidates ?? []) as Array<{ id: string }>) ids.add(c.id);

    // Busca complementar por telefone/CPF.
    if (digits.length >= 4) {
      const { data: byDigits } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .or(`phone.ilike.%${digits}%,cpf.ilike.%${digits}%`)
        .limit(20);
      for (const p of byDigits ?? []) ids.add((p as any).id);
    }

    if (ids.size === 0) return [];

    const { data: profiles, error } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email, phone, cpf")
      .in("id", Array.from(ids))
      .limit(20);
    if (error) throw new Error(error.message);

    const foundIds = (profiles ?? []).map((p: any) => p.id);
    const balances = new Map<string, number>();
    if (foundIds.length > 0) {
      const { data: entries } = await supabaseAdmin
        .from("cashback_entries")
        .select("user_id, amount, consumed, expires_at, expired_at, kind")
        .in("user_id", foundIds)
        .eq("kind", "earn")
        .is("expired_at", null);
      const now = Date.now();
      for (const e of entries ?? []) {
        const exp = (e as any).expires_at ? new Date((e as any).expires_at).getTime() : null;
        if (exp !== null && exp <= now) continue;
        const avail = Number((e as any).amount) - Number((e as any).consumed);
        if (avail <= 0) continue;
        balances.set((e as any).user_id, (balances.get((e as any).user_id) ?? 0) + avail);
      }
    }

    return (profiles ?? []).map((p: any) => ({
      id: p.id,
      name: (p.full_name ?? "").trim() || "(sem nome)",
      email: (p.email ?? "").trim(),
      phone: (p.phone ?? "").trim(),
      cpf: (p.cpf ?? "").trim(),
      balance: Math.round((balances.get(p.id) ?? 0) * 100) / 100,
    }));
  });

/** Concede cashback manualmente para um cliente. Somente SUPERADMIN. */
export const grantCashback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userId: string; amount: number; reason: string; days: number }) => {
    if (!data?.userId || !/^[0-9a-f-]{36}$/i.test(data.userId)) throw new Error("Cliente inválido");
    const amount = Math.round(Number(data.amount) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Valor inválido");
    if (amount > 5000) throw new Error("Valor acima do limite (R$ 5.000)");
    const reason = String(data.reason ?? "").trim();
    if (reason.length < 5 || reason.length > 500) throw new Error("Informe o motivo (5 a 500 caracteres)");
    const days = Math.floor(Number(data.days) || 30);
    if (days < 1 || days > 365) throw new Error("Validade deve ser entre 1 e 365 dias");
    return { userId: data.userId, amount, reason, days };
  })
  .handler(async ({ data, context }) => {
    await requireAdmin(context as never);
    const { data: entryId, error } = await context.supabase.rpc("admin_grant_cashback" as never, {
      p_user_id: data.userId,
      p_amount: data.amount,
      p_reason: data.reason,
      p_days: data.days,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true, entryId: String(entryId), amount: data.amount };
  });

/** Últimas concessões manuais (sem pedido vinculado). */
export const listManualCashbackGrants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CashbackGrantRow[]> => {
    await requireAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: entries, error } = await supabaseAdmin
      .from("cashback_entries")
      .select("id, user_id, amount, created_at, expires_at")
      .eq("kind", "earn")
      .is("order_id", null)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);

    const ids = Array.from(new Set((entries ?? []).map((e: any) => e.user_id)));
    const names = new Map<string, string>();
    if (ids.length > 0) {
      const { data: profs } = await supabaseAdmin.from("profiles").select("id, full_name").in("id", ids);
      for (const p of profs ?? []) names.set((p as any).id, ((p as any).full_name ?? "").trim());
    }

    const reasons = new Map<string, string>();
    const { data: logs } = await supabaseAdmin
      .from("admin_audit_log")
      .select("entity_id, details")
      .eq("action", "grant_cashback")
      .order("created_at", { ascending: false })
      .limit(200);
    for (const l of logs ?? []) {
      const id = (l as any).entity_id as string | null;
      if (id && !reasons.has(id)) reasons.set(id, String(((l as any).details ?? {}).reason ?? ""));
    }

    return (entries ?? []).map((e: any) => ({
      id: e.id,
      user_id: e.user_id,
      name: names.get(e.user_id) || "(sem nome)",
      amount: Number(e.amount),
      created_at: e.created_at,
      expires_at: e.expires_at,
      reason: reasons.get(e.id) ?? "",
    }));
  });
