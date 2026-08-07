import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DELIVERY_UPGRADE_FEE = 12;

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

// A Asaas rejeita callbacks que não sejam URLs públicas https (ex.: localhost em dev).
function isPublicHttpsOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    if (u.protocol !== "https:") return false;
    const h = u.hostname;
    if (h === "localhost" || h === "127.0.0.1" || h === "::1") return false;
    if (!h.includes(".")) return false;
    if (/\.local$/i.test(h)) return false;
    return true;
  } catch {
    return false;
  }
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
    if (!process.env.ASAAS_API_KEY) throw new Error("Asaas não configurado");


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

    // 3) Cria a cobrança do frete na Asaas
    const origin = originFromRequest();
    const cpfDigits = String(order.customer_cpf ?? "").replace(/\D/g, "");
    const title = `Frete - Conversão do pedido ${data.order_id.slice(0, 8).toUpperCase()} para entrega`;

    const { findOrCreateCustomer, createPayment, createPaymentLink } = await import("@/lib/asaas.server");

    let chargeId: string;
    let initPoint: string;
    try {
      if (cpfDigits.length === 11) {
        const customerId = await findOrCreateCustomer({
          name: String(order.customer_name ?? "Cliente"),
          cpfCnpj: cpfDigits,
          email: order.customer_email,
          mobilePhone: order.customer_phone,
        });
        const payment = await createPayment({
          customerId,
          value: DELIVERY_UPGRADE_FEE,
          externalReference: `upgrade:${upgradeId}`,
          description: title,
          ...(isPublicHttpsOrigin(origin) ? { successUrl: `${origin}/pedido/${data.order_id}` } : {}),
        });
        chargeId = payment.id;
        initPoint = payment.invoiceUrl;
      } else {
        const link = await createPaymentLink({ name: title.slice(0, 100), value: DELIVERY_UPGRADE_FEE });
        chargeId = link.id;
        initPoint = link.url;
      }
    } catch (err) {
      console.error("[delivery-upgrade] asaas error", err);
      throw new Error(err instanceof Error ? err.message : "Falha ao iniciar pagamento do frete");
    }

    await supabaseAdmin
      .from("delivery_upgrades")
      .update({ mp_preference_id: chargeId, mp_init_point: initPoint } as never)
      .eq("id", upgradeId);

    return { upgradeId, initPoint };

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
