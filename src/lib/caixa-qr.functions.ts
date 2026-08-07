import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type CaixaItem = { title: string; unit_price: number; quantity: number };
type Input = { items: CaixaItem[]; note?: string | null };


async function ensureStaff(context: { supabase: any; userId: string }): Promise<void> {
  const roles = ["admin", "manager", "catalog", "fulfillment", "cashier"] as const;
  for (const r of roles) {
    const { data: has } = await context.supabase.rpc("has_role" as never, {
      _user_id: context.userId,
      _role: r as never,
    } as never);
    if (has) return;
  }
  throw new Error("Sem permissão");
}

export const createCaixaQrPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: Input) => {
    if (!data || typeof data !== "object") throw new Error("Payload inválido");
    if (!Array.isArray(data.items) || data.items.length === 0) throw new Error("Adicione ao menos um item");
    if (data.items.length > 30) throw new Error("Máximo 30 itens");
    const items: CaixaItem[] = [];
    for (const raw of data.items) {
      const title = String(raw?.title ?? "").trim().slice(0, 200);
      const unit_price = Number(raw?.unit_price);
      const quantity = Number(raw?.quantity);
      if (!title) throw new Error("Descrição do item obrigatória");
      if (!Number.isFinite(unit_price) || unit_price <= 0 || unit_price > 100000) {
        throw new Error("Preço inválido");
      }
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
        throw new Error("Quantidade inválida");
      }
      items.push({ title, unit_price: Math.round(unit_price * 100) / 100, quantity });
    }
    const total = items.reduce((a, i) => a + i.unit_price * i.quantity, 0);
    if (total <= 0) throw new Error("Total inválido");
    if (total > 200000) throw new Error("Total acima do limite permitido");
    return { items, note: (data.note ?? "").toString().slice(0, 200) || null };
  })
  .handler(async ({ data, context }) => {
    await ensureStaff(context);

    if (!process.env.ASAAS_API_KEY) throw new Error("Asaas não configurado");

    const total = data.items.reduce((a, i) => a + i.unit_price * i.quantity, 0);

    // Nome do operador para histórico
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", context.userId)
      .maybeSingle();
    const operatorName =
      (profile as any)?.full_name || (profile as any)?.email || (context.claims as any)?.email || null;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Cria o registro da cobrança primeiro para termos o id de correlação
    const { data: charge, error: insErr } = await supabaseAdmin
      .from("pos_charges")
      .insert({
        operator_id: context.userId,
        operator_name: operatorName,
        items: data.items,
        total,
        note: data.note,
        status: "pending",
      } as never)
      .select("id")
      .single();
    if (insErr || !charge) {
      console.error("[caixa-qr] insert pos_charges failed", insErr);
      throw new Error("Falha ao registrar cobrança");
    }
    const chargeId = (charge as { id: string }).id;

    try {
      const { createPaymentLink } = await import("@/lib/asaas.server");
      const link = await createPaymentLink({
        name: `Caixa shopbox ${chargeId.slice(0, 8).toUpperCase()}`,
        value: total,
        description: data.items.map((i) => `${i.quantity}x ${i.title}`).join(" | "),
      });

      // O id do link é a chave de correlação usada pelo webhook da Asaas.
      await supabaseAdmin
        .from("pos_charges")
        .update({ mp_preference_id: link.id } as never)
        .eq("id", chargeId);

      return {
        chargeId,
        preferenceId: link.id,
        initPoint: link.url,
        total,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao gerar cobrança na Asaas";
      console.error("[caixa-qr] asaas payment link error", msg);
      await supabaseAdmin
        .from("pos_charges")
        .update({ status: "failed", mp_status_detail: msg.slice(0, 500) } as never)
        .eq("id", chargeId);
      throw new Error(msg);
    }
  });


export const getPosChargeStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { chargeId: string }) => {
    if (!data?.chargeId || typeof data.chargeId !== "string") throw new Error("chargeId obrigatório");
    return { chargeId: data.chargeId };
  })
  .handler(async ({ data, context }) => {
    await ensureStaff(context);
    const { data: row, error } = await context.supabase
      .from("pos_charges")
      .select("id,status,total,items,note,operator_name,mp_status,mp_status_detail,mp_payment_method_id,mp_payment_id,paid_at,last_event_at,created_at")
      .eq("id", data.chargeId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const listRecentPosCharges = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureStaff(context);
    const { data, error } = await context.supabase
      .from("pos_charges")
      .select("id,total,status,note,items,operator_name,mp_payment_method_id,paid_at,created_at")
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    return data ?? [];
  });


export const getPosChargesMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureStaff(context);
    // Janela de 8 dias (hoje + 7 dias anteriores) alinhada com 00:00 local (America/Sao_Paulo ≈ -03:00).
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const start8d = new Date(startToday.getTime() - 7 * 24 * 60 * 60 * 1000);
    const { data, error } = await context.supabase
      .from("pos_charges")
      .select("total,status,paid_at,created_at")
      .gte("created_at", start8d.toISOString())
      .limit(2000);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Array<{
      total: number | string;
      status: string;
      paid_at: string | null;
      created_at: string;
    }>;
    let paid8dTotal = 0,
      paid8dCount = 0,
      paidTodayTotal = 0,
      paidTodayCount = 0,
      pending8dCount = 0;
    for (const r of rows) {
      const total = Number(r.total ?? 0);
      const paidAt = r.paid_at ? new Date(r.paid_at) : null;
      if (r.status === "paid") {
        paid8dTotal += total;
        paid8dCount += 1;
        if (paidAt && paidAt >= startToday) {
          paidTodayTotal += total;
          paidTodayCount += 1;
        }
      } else if (r.status === "pending") {
        pending8dCount += 1;
      }
    }
    return {
      paidToday: { total: paidTodayTotal, count: paidTodayCount },
      paid8Days: { total: paid8dTotal, count: paid8dCount },
      pending8Days: pending8dCount,
      since: start8d.toISOString(),
    };
  });
