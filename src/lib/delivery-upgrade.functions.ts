import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DELIVERY_UPGRADE_FEE = 10;

const RMC = [
  "curitiba","almirante tamandare","araucaria","campina grande do sul",
  "campo largo","campo magro","colombo","fazenda rio grande",
  "pinhais","piraquara","quatro barras","sao jose dos pinhais",
];

type ShippingInput = {
  zip: string;
  street: string;
  number: string;
  complement?: string | null;
  district?: string | null;
  city: string;
  state: string;
  recipient_name?: string | null;
  recipient_phone?: string | null;
};

type CreateUpgradeInput = {
  order_id: string;
  shipping: ShippingInput;
};

function originFromRequest(): string {
  const req = getRequest();
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("host") ?? "localhost";
  return `${proto}://${host}`;
}

export const createDeliveryUpgrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: CreateUpgradeInput) => {
    if (!data || typeof data !== "object") throw new Error("Payload inválido");
    if (!data.order_id || !/^[0-9a-f-]{36}$/i.test(data.order_id)) throw new Error("Pedido inválido");
    const s = data.shipping;
    if (!s) throw new Error("Endereço obrigatório");
    const zip = (s.zip ?? "").replace(/\D/g, "");
    if (zip.length !== 8) throw new Error("CEP inválido");
    if (!s.street || s.street.trim().length < 2) throw new Error("Rua obrigatória");
    if (!s.number || String(s.number).trim().length < 1) throw new Error("Número obrigatório");
    if (!s.city || s.city.trim().length < 2) throw new Error("Cidade obrigatória");
    const cityNorm = s.city.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    if (!RMC.includes(cityNorm)) throw new Error("Entregamos apenas em Curitiba e região metropolitana");
    return data;
  })
  .handler(async ({ data, context }) => {
    const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    if (!accessToken) throw new Error("Mercado Pago não configurado");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1) Valida elegibilidade do pedido
    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .select("id, user_id, status, delivery_method, fulfillment_status, customer_name, customer_email, customer_phone, customer_cpf")
      .eq("id", data.order_id)
      .maybeSingle();
    if (orderErr) throw new Error(orderErr.message);
    if (!order) throw new Error("Pedido não encontrado");
    if (order.user_id !== context.userId) throw new Error("Sem permissão");
    if (order.status !== "paid") throw new Error("Só pedidos já pagos podem ser convertidos");
    if (order.delivery_method === "delivery") throw new Error("Este pedido já é entrega");
    const ff = String(order.fulfillment_status ?? "");
    if (ff === "completed" || ff === "delivered") {
      throw new Error("Este pedido já foi retirado — não pode mais ser convertido");
    }

    // 2) Já existe upgrade pendente? Reutiliza.
    const { data: existing } = await supabaseAdmin
      .from("delivery_upgrades")
      .select("id, mp_init_point")
      .eq("order_id", data.order_id)
      .eq("status", "pending")
      .maybeSingle();
    if (existing && (existing as { mp_init_point: string | null }).mp_init_point) {
      return { upgradeId: (existing as { id: string }).id, initPoint: (existing as { mp_init_point: string }).mp_init_point };
    }

    const s = data.shipping;
    const shippingRow = {
      order_id: data.order_id,
      user_id: context.userId,
      fee: DELIVERY_UPGRADE_FEE,
      status: "pending",
      shipping_zip: s.zip.replace(/\D/g, ""),
      shipping_street: s.street.trim(),
      shipping_number: String(s.number).trim(),
      shipping_complement: s.complement?.trim() || null,
      shipping_district: s.district?.trim() || null,
      shipping_city: s.city.trim(),
      shipping_state: (s.state || "PR").toUpperCase(),
      shipping_recipient_name: (s.recipient_name ?? order.customer_name ?? "").trim() || null,
      shipping_recipient_phone: (s.recipient_phone ?? order.customer_phone ?? "").replace(/\D/g, "") || null,
    };

    let upgradeId: string;
    if (existing) {
      upgradeId = (existing as { id: string }).id;
      await supabaseAdmin.from("delivery_upgrades").update(shippingRow as never).eq("id", upgradeId);
    } else {
      const { data: ins, error: insErr } = await supabaseAdmin
        .from("delivery_upgrades")
        .insert(shippingRow as never)
        .select("id")
        .single();
      if (insErr || !ins) throw new Error(insErr?.message ?? "Falha ao registrar upgrade");
      upgradeId = (ins as { id: string }).id;
    }

    // 3) Cria preferência MP (Pix) para o frete
    const origin = originFromRequest();
    const nameParts = String(order.customer_name ?? "").trim().split(/\s+/);
    const firstName = nameParts[0] ?? "Cliente";
    const lastName = nameParts.slice(1).join(" ") || firstName;
    const phoneDigits = String(order.customer_phone ?? "").replace(/\D/g, "");
    const cpfDigits = String(order.customer_cpf ?? "").replace(/\D/g, "");

    const preferenceBody = {
      external_reference: `upgrade:${upgradeId}`,
      items: [{
        id: upgradeId,
        title: `Frete - Conversão do pedido ${data.order_id.slice(0, 8).toUpperCase()} para entrega`,
        quantity: 1,
        unit_price: DELIVERY_UPGRADE_FEE,
        currency_id: "BRL",
      }],
      payer: {
        name: firstName,
        surname: lastName,
        email: order.customer_email ?? undefined,
        ...(phoneDigits ? { phone: { area_code: phoneDigits.slice(0, 2), number: phoneDigits.slice(2) } } : {}),
        ...(cpfDigits ? { identification: { type: "CPF", number: cpfDigits } } : {}),
        address: {
          zip_code: shippingRow.shipping_zip,
          street_name: shippingRow.shipping_street,
          street_number: shippingRow.shipping_number,
          neighborhood: shippingRow.shipping_district ?? "",
          city: shippingRow.shipping_city,
          federal_unit: shippingRow.shipping_state,
        },
      },
      payment_methods: {
        excluded_payment_types: [{ id: "credit_card" }, { id: "debit_card" }, { id: "ticket" }, { id: "atm" }],
        default_payment_method_id: "pix",
        default_installments: 1,
      },
      back_urls: {
        success: `${origin}/pedido/${data.order_id}`,
        pending: `${origin}/pedido/${data.order_id}`,
        failure: `${origin}/pedido/${data.order_id}`,
      },
      auto_return: "approved",
      notification_url: `${origin}/api/public/mp/webhook`,
      statement_descriptor: "SHOPBOX",
      metadata: { upgrade_id: upgradeId, order_id: data.order_id, user_id: context.userId },
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
      console.error("[delivery-upgrade] mp preference error", mpRes.status, errText);
      throw new Error("Falha ao iniciar pagamento do frete");
    }
    const pref = (await mpRes.json()) as { id: string; init_point: string };

    await supabaseAdmin
      .from("delivery_upgrades")
      .update({ mp_preference_id: pref.id, mp_init_point: pref.init_point } as never)
      .eq("id", upgradeId);

    return { upgradeId, initPoint: pref.init_point };
  });

export const cancelDeliveryUpgrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { upgrade_id: string }) => {
    if (!data?.upgrade_id || !/^[0-9a-f-]{36}$/i.test(data.upgrade_id)) throw new Error("Upgrade inválido");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("delivery_upgrades")
      .select("id, user_id, status")
      .eq("id", data.upgrade_id)
      .maybeSingle();
    if (!row) throw new Error("Não encontrado");
    if ((row as { user_id: string }).user_id !== context.userId) throw new Error("Sem permissão");
    if ((row as { status: string }).status !== "pending") return { ok: true };
    await supabaseAdmin
      .from("delivery_upgrades")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() } as never)
      .eq("id", data.upgrade_id);
    return { ok: true };
  });
