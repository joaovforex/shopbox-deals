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
    // Autorização: admin, gerente, catálogo ou expedição (equipe da loja)
    const roles: Array<"admin" | "manager" | "catalog" | "fulfillment"> = [
      "admin",
      "manager",
      "catalog",
      "fulfillment",
    ];
    let allowed = false;
    for (const r of roles) {
      const { data: has } = await context.supabase.rpc("has_role" as never, {
        _user_id: context.userId,
        _role: r,
      } as never);
      if (has) { allowed = true; break; }
    }
    if (!allowed) throw new Error("Sem permissão");

    const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    if (!accessToken) throw new Error("Mercado Pago não configurado");

    const origin = originFromRequest();
    const total = data.items.reduce((a, i) => a + i.unit_price * i.quantity, 0);

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
      metadata: {
        source: "caixa_qr",
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
      throw new Error("Falha ao gerar cobrança no Mercado Pago");
    }

    const pref = (await mpRes.json()) as { id: string; init_point: string };
    return {
      preferenceId: pref.id,
      initPoint: pref.init_point,
      total,
    };
  });
