import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type CaixaItem = { title: string; unit_price: number; quantity: number };
type Input = { items: CaixaItem[]; note?: string | null };

function originFromRequest(): string {
  const req = getRequest();
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("host") ?? "localhost";
  return `${proto}://${host}`;
}

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

    const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    if (!accessToken) throw new Error("Mercado Pago não configurado");

    const origin = originFromRequest();
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

    // Cria o registro da cobrança primeiro para termos o id como external_reference
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
    const externalReference = `pos:${chargeId}`;

    const preferenceBody = {
      items: data.items.map((it) => ({
        title: it.title,
        quantity: it.quantity,
        unit_price: it.unit_price,
        currency_id: "BRL",
      })),
      back_urls: {
        success: `${origin}/redirecionando`,
        pending: `${origin}/redirecionando`,
        failure: `${origin}/redirecionando`,
      },
      statement_descriptor: "SHOPBOX",
      external_reference: externalReference,
      metadata: {
        source: "caixa_qr",
        pos_charge_id: chargeId,
        cashier_user_id: context.userId,
        note: data.note ?? "",
      },
    };

    const mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(preferenceBody),
    });

    if (!mpRes.ok) {
      const errText = await mpRes.text();
      console.error("[caixa-qr] mp preference error", mpRes.status, errText);
      await supabaseAdmin
        .from("pos_charges")
        .update({ status: "failed", mp_status_detail: errText.slice(0, 500) } as never)
        .eq("id", chargeId);
      throw new Error("Falha ao gerar cobrança no Mercado Pago");
    }

    const pref = (await mpRes.json()) as { id: string; init_point: string };

    await supabaseAdmin
      .from("pos_charges")
      .update({ mp_preference_id: pref.id } as never)
      .eq("id", chargeId);

    return {
      chargeId,
      preferenceId: pref.id,
      initPoint: pref.init_point,
      total,
    };
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

export const listRecentPosCharges = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureStaff(context);
    const { data, error } = await context.supabase
      .from("pos_charges")
      .select("id,total,status,note,operator_name,mp_payment_method_id,paid_at,created_at")
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
