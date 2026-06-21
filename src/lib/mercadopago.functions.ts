import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type CartItemInput = { product_id: string; quantity: number; color?: string | null };

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

type CreatePreferenceInput = {
  customer_name: string;
  customer_email: string;
  customer_phone: string; // digits only
  customer_cpf: string; // digits only
  delivery_method: "pickup" | "delivery";
  shipping?: ShippingInput | null;
  items: CartItemInput[];
};


function originFromRequest(): string {
  const req = getRequest();
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("host") ?? "localhost";
  return `${proto}://${host}`;
}

export const createMpPreference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: CreatePreferenceInput) => {
    if (!data || typeof data !== "object") throw new Error("Payload inválido");
    if (!Array.isArray(data.items) || data.items.length === 0) throw new Error("Carrinho vazio");
    if (data.items.length > 50) throw new Error("Carrinho muito grande");
    for (const it of data.items) {
      if (!it.product_id || typeof it.product_id !== "string") throw new Error("Item inválido");
      if (!Number.isInteger(it.quantity) || it.quantity < 1 || it.quantity > 999) {
        throw new Error("Quantidade inválida");
      }
      if (it.color != null && typeof it.color !== "string") throw new Error("Cor inválida");
    }
    if (data.delivery_method === "delivery") {
      const s = data.shipping;
      if (!s) throw new Error("Endereço de entrega obrigatório");
      const zip = (s.zip ?? "").replace(/\D/g, "");
      if (zip.length !== 8) throw new Error("CEP inválido");
      if (!s.street || s.street.length < 2) throw new Error("Rua obrigatória");
      if (!s.number) throw new Error("Número obrigatório");
      if (!/curitiba/i.test(s.city ?? "")) throw new Error("Por enquanto entregamos apenas em Curitiba");
    }
    return data;
  })

  .handler(async ({ data, context }) => {
    const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    if (!accessToken) throw new Error("Mercado Pago não configurado");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 0) Limpa pedidos pendentes antigos (>30min) devolvendo o estoque
    await supabaseAdmin.rpc("expire_stale_pending_orders" as never, { p_minutes: 30 } as never);

    // 1) Cria pedido pendente usando o client AUTENTICADO do usuário
    //    para que auth.uid() dentro da RPC preencha orders.user_id corretamente.
    const { data: orderId, error: orderErr } = await context.supabase.rpc(
      "create_pending_order" as never,
      {
        p_customer_name: data.customer_name,
        p_customer_email: data.customer_email,
        p_customer_phone: data.customer_phone,
        p_customer_cpf: data.customer_cpf,
        p_payment_method: "mercadopago",
        p_delivery_method: data.delivery_method,
        p_items: data.items,
      } as never,
    );
    if (orderErr || !orderId) {
      throw new Error(orderErr?.message ?? "Falha ao criar pedido");
    }

    // Garantia extra: se por algum motivo user_id veio nulo, força com o userId do contexto.
    // Também salva o endereço de entrega quando aplicável.
    const orderUpdate: {
      user_id?: string;
      shipping_zip?: string;
      shipping_street?: string;
      shipping_number?: string;
      shipping_complement?: string | null;
      shipping_district?: string | null;
      shipping_city?: string;
      shipping_state?: string;
      shipping_recipient_name?: string | null;
      shipping_recipient_phone?: string | null;
      shipping_address?: string;
    } = {};
    if (data.delivery_method === "delivery" && data.shipping) {
      const s = data.shipping;
      orderUpdate.shipping_zip = s.zip.replace(/\D/g, "");
      orderUpdate.shipping_street = s.street.trim();
      orderUpdate.shipping_number = String(s.number).trim();
      orderUpdate.shipping_complement = s.complement?.trim() || null;
      orderUpdate.shipping_district = s.district?.trim() || null;
      orderUpdate.shipping_city = s.city.trim();
      orderUpdate.shipping_state = (s.state || "PR").toUpperCase();
      orderUpdate.shipping_recipient_name = (s.recipient_name ?? data.customer_name).trim();
      orderUpdate.shipping_recipient_phone = (s.recipient_phone ?? data.customer_phone).replace(/\D/g, "");
      orderUpdate.shipping_address = `${orderUpdate.shipping_street}, ${orderUpdate.shipping_number}${orderUpdate.shipping_complement ? " - " + orderUpdate.shipping_complement : ""}, ${orderUpdate.shipping_district ?? ""} - ${orderUpdate.shipping_city}/${orderUpdate.shipping_state} - ${orderUpdate.shipping_zip}`;
    }
    if (Object.keys(orderUpdate).length > 0) {
      await supabaseAdmin
        .from("orders")
        .update(orderUpdate)
        .eq("id", orderId as string);
    }
    await supabaseAdmin
      .from("orders")
      .update({ user_id: context.userId })
      .eq("id", orderId as string)
      .is("user_id", null);


    // 2) Busca itens já gravados para montar a preferência com nome/preço reais
    const { data: orderItems, error: itemsErr } = await supabaseAdmin
      .from("order_items")
      .select("product_name, unit_price, quantity")
      .eq("order_id", orderId as string);
    if (itemsErr || !orderItems) throw new Error("Falha ao carregar itens do pedido");

    const origin = originFromRequest();

    const nameParts = data.customer_name.trim().split(/\s+/);
    const firstName = nameParts[0] ?? "";
    const lastName = nameParts.slice(1).join(" ") || firstName;

    const preferenceBody = {
      external_reference: orderId,
      items: orderItems.map((it) => ({
        id: orderId as string,
        title: String(it.product_name).slice(0, 250),
        quantity: it.quantity,
        unit_price: Number(it.unit_price),
        currency_id: "BRL",
      })),
      payer: {
        name: firstName,
        surname: lastName,
        email: data.customer_email,
        phone: {
          area_code: data.customer_phone.slice(0, 2),
          number: data.customer_phone.slice(2),
        },
        identification: { type: "CPF", number: data.customer_cpf },
      },
      payment_methods: {
        default_installments: 1,
      },
      back_urls: {
        success: `${origin}/pedido/${orderId}`,
        pending: `${origin}/pedido/${orderId}`,
        failure: `${origin}/loja`,
      },
      auto_return: "approved",
      notification_url: `${origin}/api/public/mp/webhook`,
      statement_descriptor: "SHOPBOX",
      metadata: { order_id: orderId },
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
      console.error("[mp] preference error", mpRes.status, errText);
      // Cancela o pedido (estoque retorna via trigger restore_stock_on_cancel)
      await supabaseAdmin.from("orders").update({ status: "cancelled" }).eq("id", orderId as string);
      throw new Error("Falha ao iniciar pagamento");
    }

    const pref = (await mpRes.json()) as { id: string; init_point: string; sandbox_init_point: string };

    await supabaseAdmin
      .from("orders")
      .update({ mp_preference_id: pref.id })
      .eq("id", orderId as string);

    return {
      orderId: orderId as string,
      preferenceId: pref.id,
      initPoint: pref.init_point,
    };
  });
