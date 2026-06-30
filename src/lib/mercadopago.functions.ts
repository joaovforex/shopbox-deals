import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isValidCpf } from "@/lib/cpf";

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
  customer_phone: string;
  customer_cpf: string;
  delivery_method: "pickup" | "delivery";
  shipping?: ShippingInput | null;
  items: CartItemInput[];
  /** Salva os dados do cliente/endereço no perfil para reuso futuro. */
  save_profile?: boolean;
  /** Cashback a aplicar como desconto (em reais). */
  use_cashback?: number;
};

// Endereço da loja — usado como payer.address de fallback quando o cliente
// retira na loja e ainda não cadastrou endereço próprio. Melhora o score
// antifraude do MP (cliente sem endereço = sinal ruim).
const STORE_PAYER_ADDRESS = {
  zip_code: "83408290",
  street_name: "Rua Emílio Gleber",
  street_number: "1118",
  neighborhood: "Centro",
  city: "Colombo",
  federal_unit: "PR",
} as const;

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
    const cpf = (data.customer_cpf ?? "").replace(/\D/g, "");
    if (!isValidCpf(cpf)) throw new Error("CPF inválido");
    if (data.delivery_method === "delivery") {
      const s = data.shipping;
      if (!s) throw new Error("Endereço de entrega obrigatório");
      const zip = (s.zip ?? "").replace(/\D/g, "");
      if (zip.length !== 8) throw new Error("CEP inválido");
      if (!s.street || s.street.length < 2) throw new Error("Rua obrigatória");
      if (!s.number) throw new Error("Número obrigatório");
      const cityNorm = (s.city ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
      const RMC = ["curitiba","almirante tamandare","araucaria","campina grande do sul","campo largo","campo magro","colombo","fazenda rio grande","pinhais","piraquara","quatro barras","sao jose dos pinhais"];
      if (!RMC.includes(cityNorm)) throw new Error("Entregamos apenas em Curitiba e região metropolitana");
    }
    return data;
  })
  .handler(async ({ data, context }) => {
    const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    if (!accessToken) throw new Error("Mercado Pago não configurado");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Limpa pedidos pendentes antigos devolvendo o estoque
    await supabaseAdmin.rpc("expire_stale_pending_orders" as never, { p_minutes: 5 } as never);

    // Lê data de cadastro do usuário (melhora score antifraude)
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const userCreatedAt = authUser?.user?.created_at ?? null;

    // Lê perfil salvo (endereço de cobrança / fallback no pickup)
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("address_zip, address_street, address_number, address_district, address_city, address_state")
      .eq("id", context.userId)
      .maybeSingle();

    // 1) Cria pedido pendente
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

    // Salva endereço no pedido + força user_id
    const orderUpdate: Record<string, unknown> = {};
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
      await supabaseAdmin.from("orders").update(orderUpdate as never).eq("id", orderId as string);
    }
    await supabaseAdmin
      .from("orders")
      .update({ user_id: context.userId })
      .eq("id", orderId as string)
      .is("user_id", null);

    // Salva perfil do cliente se solicitado
    if (data.save_profile) {
      const profPatch: Record<string, unknown> = {
        id: context.userId,
        full_name: data.customer_name.trim(),
        email: data.customer_email.trim().toLowerCase(),
        phone: data.customer_phone.replace(/\D/g, ""),
        cpf: data.customer_cpf.replace(/\D/g, ""),
      };
      if (data.delivery_method === "delivery" && data.shipping) {
        profPatch.address_zip = data.shipping.zip.replace(/\D/g, "");
        profPatch.address_street = data.shipping.street.trim();
        profPatch.address_number = String(data.shipping.number).trim();
        profPatch.address_complement = data.shipping.complement?.trim() || null;
        profPatch.address_district = data.shipping.district?.trim() || null;
        profPatch.address_city = data.shipping.city.trim();
        profPatch.address_state = (data.shipping.state || "PR").toUpperCase();
      }
      await supabaseAdmin.from("profiles").upsert(profPatch as never, { onConflict: "id" } as never);
    }

    // 2) Itens
    const { data: orderItems, error: itemsErr } = await supabaseAdmin
      .from("order_items")
      .select("product_name, unit_price, quantity")
      .eq("order_id", orderId as string);
    if (itemsErr || !orderItems) throw new Error("Falha ao carregar itens do pedido");

    const subtotal = orderItems.reduce(
      (acc, it) => acc + Number(it.unit_price) * Number(it.quantity),
      0,
    );
    const shippingFee =
      data.delivery_method === "delivery" ? (subtotal < 80 ? 10 : 0) : 0;

    // 2.1) Cashback (opcional) — aplicado via RPC para garantir consistência de saldo
    let cashbackUsed = 0;
    const requestedCashback = Math.max(0, Math.min(Number(data.use_cashback ?? 0), subtotal));
    if (requestedCashback > 0) {
      const { data: applied, error: cbErr } = await context.supabase.rpc(
        "apply_cashback_to_order" as never,
        { p_order_id: orderId as string, p_amount: requestedCashback } as never,
      );
      if (cbErr) throw new Error(cbErr.message);
      cashbackUsed = Math.max(0, Number(applied ?? 0));
    }

    const productsTotal = Math.max(0, subtotal - cashbackUsed);
    const grandTotal = productsTotal + shippingFee;

    await supabaseAdmin
      .from("orders")
      .update({
        delivery_fee: shippingFee,
        total: grandTotal,
        cashback_used: cashbackUsed,
      } as never)
      .eq("id", orderId as string);

    const origin = originFromRequest();
    const nameParts = data.customer_name.trim().split(/\s+/);
    const firstName = nameParts[0] ?? "";
    const lastName = nameParts.slice(1).join(" ") || firstName;
    const phoneDigits = data.customer_phone.replace(/\D/g, "");
    const cpfDigits = data.customer_cpf.replace(/\D/g, "");

    // Quando há cashback aplicado, consolidamos os itens em uma única linha
    // com o preço final (subtotal - cashback) para garantir que o total cobrado
    // no Mercado Pago bate exatamente com o que o cliente vê.
    type MpItem = { id: string; title: string; quantity: number; unit_price: number; currency_id: string };
    const mpItems: MpItem[] = cashbackUsed > 0
      ? [{
          id: orderId as string,
          title: `Pedido shopbox (${orderItems.length} ${orderItems.length === 1 ? "item" : "itens"}) - desconto cashback R$ ${cashbackUsed.toFixed(2)}`.slice(0, 250),
          quantity: 1,
          unit_price: Number(productsTotal.toFixed(2)),
          currency_id: "BRL",
        }]
      : orderItems.map((it) => ({
          id: orderId as string,
          title: String(it.product_name).slice(0, 250),
          quantity: it.quantity,
          unit_price: Number(it.unit_price),
          currency_id: "BRL",
        }));
    if (shippingFee > 0) {
      mpItems.push({
        id: orderId as string,
        title: "Frete - Entrega Curitiba e região",
        quantity: 1,
        unit_price: shippingFee,
        currency_id: "BRL",
      });
    }

    // payer.address: usa shipping > perfil salvo > endereço da loja (fallback)
    const profAddr = profile && profile.address_zip ? {
      zip_code: (profile.address_zip ?? "").replace(/\D/g, ""),
      street_name: profile.address_street ?? "",
      street_number: profile.address_number ?? "",
      neighborhood: profile.address_district ?? "",
      city: profile.address_city ?? "",
      federal_unit: profile.address_state ?? "PR",
    } : null;
    const shipAddr = data.shipping ? {
      zip_code: (data.shipping.zip ?? "").replace(/\D/g, ""),
      street_name: data.shipping.street,
      street_number: String(data.shipping.number),
      neighborhood: data.shipping.district ?? "",
      city: data.shipping.city,
      federal_unit: (data.shipping.state ?? "PR").toUpperCase(),
    } : null;
    const payerAddress = shipAddr ?? profAddr ?? { ...STORE_PAYER_ADDRESS };

    // shipments: mesmo no pickup mandamos pickup mode pra o MP saber que é retirada
    const shipments = data.delivery_method === "delivery" && shipAddr
      ? {
          mode: "not_specified",
          cost: shippingFee,
          receiver_address: shipAddr,
        }
      : { mode: "not_specified", local_pickup: true };

    const preferenceBody = {
      external_reference: orderId,
      items: mpItems,
      payer: {
        name: firstName,
        surname: lastName,
        email: data.customer_email,
        phone: {
          area_code: phoneDigits.slice(0, 2),
          number: phoneDigits.slice(2),
        },
        identification: { type: "CPF", number: cpfDigits },
        address: payerAddress,
        ...(userCreatedAt ? { date_created: userCreatedAt } : {}),
      },
      shipments,
      payment_methods: {
        default_installments: 1,
      },
      back_urls: {
        success: `${origin}/pedido/${orderId}`,
        pending: `${origin}/pedido/${orderId}`,
        failure: `${origin}/pedido/${orderId}`,
      },
      auto_return: "approved",
      notification_url: `${origin}/api/public/mp/webhook`,
      statement_descriptor: "SHOPBOX",
      metadata: { order_id: orderId, user_id: context.userId },
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
      await supabaseAdmin.from("orders").update({ status: "cancelled" }).eq("id", orderId as string);
      throw new Error("Falha ao iniciar pagamento");
    }

    const pref = (await mpRes.json()) as { id: string; init_point: string; sandbox_init_point: string };

    await supabaseAdmin
      .from("orders")
      .update({ mp_preference_id: pref.id, mp_init_point: pref.init_point } as never)
      .eq("id", orderId as string);

    return {
      orderId: orderId as string,
      preferenceId: pref.id,
      initPoint: pref.init_point,
    };
  });

// Permite ao cliente retomar o pagamento de um pedido pendente
export const resumePendingPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { orderId: string }) => {
    if (!data?.orderId || !/^[0-9a-f-]{36}$/i.test(data.orderId)) throw new Error("Pedido inválido");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.rpc("expire_stale_pending_orders" as never, { p_minutes: 5 } as never);

    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select("id, user_id, status, mp_init_point, mp_preference_id, created_at")
      .eq("id", data.orderId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!order) throw new Error("Pedido não encontrado");
    if (order.user_id !== context.userId) throw new Error("Sem permissão");
    if (order.status !== "pending") {
      throw new Error(order.status === "paid" ? "Pedido já foi pago" : "Pedido expirado. Faça um novo pedido.");
    }

    const ageMs = Date.now() - new Date(order.created_at).getTime();
    if (ageMs > 5 * 60 * 1000) throw new Error("Pedido expirado. Faça um novo pedido.");

    const rec = order as unknown as { mp_init_point: string | null; mp_preference_id: string | null };
    const link =
      rec.mp_init_point ||
      (rec.mp_preference_id
        ? `https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=${rec.mp_preference_id}`
        : null);
    if (!link) throw new Error("Link de pagamento indisponível");
    return { initPoint: link };
  });
