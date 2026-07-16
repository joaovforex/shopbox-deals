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

type CreateCieloCheckoutInput = {
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  customer_cpf: string;
  delivery_method: "pickup" | "delivery";
  shipping?: ShippingInput | null;
  items: CartItemInput[];
  save_profile?: boolean;
  use_cashback?: number;
  payment_method?: "credit_card" | "debit_card" | "pix";
  installments?: number;
};

const MAX_INSTALLMENTS = 7;

function originFromRequest(): string {
  const req = getRequest();
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("host") ?? "localhost";
  return `${proto}://${host}`;
}

export const createCieloCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: CreateCieloCheckoutInput) => {
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
    if (data.payment_method && !["credit_card", "debit_card", "pix"].includes(data.payment_method)) {
      throw new Error("Forma de pagamento inválida");
    }
    if (data.installments != null) {
      if (!Number.isInteger(data.installments) || data.installments < 1 || data.installments > MAX_INSTALLMENTS) {
        throw new Error("Parcelamento inválido");
      }
    }
    return data;
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { createCheckout } = await import("@/lib/cielo.server");

    // Limpa pedidos pendentes antigos devolvendo estoque
    await supabaseAdmin.rpc("expire_stale_pending_orders" as never, { p_minutes: 5 } as never);

    // Bloqueio anti-duplicidade
    {
      const productIds = Array.from(new Set(data.items.map((i) => i.product_id)));
      const { data: pendingOrders } = await supabaseAdmin
        .from("orders")
        .select("id, created_at, cielo_checkout_url, mp_init_point, order_items!inner(product_id)")
        .eq("user_id", context.userId)
        .eq("status", "pending")
        .in("order_items.product_id", productIds)
        .order("created_at", { ascending: false })
        .limit(1);
      const existing = (pendingOrders ?? [])[0] as
        | { id: string; cielo_checkout_url: string | null; mp_init_point: string | null }
        | undefined;
      if (existing) {
        const err = new Error(
          "Você já tem um checkout em andamento para um destes produtos. Finalize ou aguarde 5 minutos antes de tentar novamente.",
        ) as Error & { existing_order_id?: string; existing_checkout_url?: string | null };
        err.existing_order_id = existing.id;
        err.existing_checkout_url = existing.cielo_checkout_url ?? existing.mp_init_point ?? null;
        throw err;
      }
    }

    // 1) Cria pedido pendente
    const { data: orderId, error: orderErr } = await context.supabase.rpc(
      "create_pending_order" as never,
      {
        p_customer_name: data.customer_name,
        p_customer_email: data.customer_email,
        p_customer_phone: data.customer_phone,
        p_customer_cpf: data.customer_cpf,
        p_payment_method: "cielo",
        p_delivery_method: data.delivery_method,
        p_items: data.items,
      } as never,
    );
    if (orderErr || !orderId) {
      throw new Error(orderErr?.message ?? "Falha ao criar pedido");
    }

    // Salva endereço no pedido + força user_id + provider
    const orderUpdate: Record<string, unknown> = {
      payment_provider: "cielo",
    };
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
    await supabaseAdmin.from("orders").update(orderUpdate as never).eq("id", orderId as string);
    await supabaseAdmin
      .from("orders")
      .update({ user_id: context.userId })
      .eq("id", orderId as string)
      .is("user_id", null);

    // Salva/atualiza perfil
    {
      const profPatch: Record<string, unknown> = {
        id: context.userId,
        full_name: data.customer_name.trim(),
        email: data.customer_email.trim().toLowerCase(),
        phone: data.customer_phone.replace(/\D/g, ""),
        cpf: data.customer_cpf.replace(/\D/g, ""),
      };
      if (data.save_profile && data.delivery_method === "delivery" && data.shipping) {
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

    // 2) Itens do pedido
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

    // 2.1) Cashback
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
        cielo_payment_method: data.payment_method ?? null,
        cielo_installments: data.installments ?? null,
      } as never)
      .eq("id", orderId as string);

    // Monta itens em centavos (Cielo trabalha em cents)
    type CItem = { name: string; unitPriceCents: number; quantity: number; sku?: string };
    const cieloItems: CItem[] = cashbackUsed > 0
      ? [{
          name: `Pedido shopbox (${orderItems.length} ${orderItems.length === 1 ? "item" : "itens"}) - desconto cashback R$ ${cashbackUsed.toFixed(2)}`,
          unitPriceCents: Math.round(productsTotal * 100),
          quantity: 1,
          sku: (orderId as string).slice(0, 40),
        }]
      : orderItems.map((it) => ({
          name: String(it.product_name),
          unitPriceCents: Math.round(Number(it.unit_price) * 100),
          quantity: Number(it.quantity),
          sku: (orderId as string).slice(0, 40),
        }));
    if (shippingFee > 0) {
      cieloItems.push({
        name: "Frete - Entrega Curitiba e região",
        unitPriceCents: Math.round(shippingFee * 100),
        quantity: 1,
        sku: (orderId as string).slice(0, 40),
      });
    }

    const origin = originFromRequest();
    const phoneDigits = data.customer_phone.replace(/\D/g, "");
    const cpfDigits = data.customer_cpf.replace(/\D/g, "");

    const shippingArg = data.delivery_method === "delivery" && data.shipping
      ? {
          type: "Fixed" as const,
          priceCents: Math.round(shippingFee * 100),
          address: {
            street: data.shipping.street,
            number: String(data.shipping.number),
            complement: data.shipping.complement ?? "",
            district: data.shipping.district ?? "",
            city: data.shipping.city,
            state: (data.shipping.state ?? "PR").toUpperCase(),
            zipCode: data.shipping.zip.replace(/\D/g, ""),
          },
        }
      : { type: "WithoutShipping" as const };

    let checkout;
    try {
      checkout = await createCheckout({
        orderNumber: orderId as string,
        softDescriptor: "SHOPBOX",
        items: cieloItems,
        shipping: shippingArg,
        maxInstallments: Math.min(MAX_INSTALLMENTS, data.installments ?? MAX_INSTALLMENTS),
        returnUrl: `${origin}/pedido/${orderId}`,
        webhookUrl: `${origin}/api/public/cielo/webhook`,
        customer: {
          name: data.customer_name.trim(),
          email: data.customer_email.trim(),
          identity: cpfDigits,
          identityType: "CPF",
          phone: phoneDigits,
        },
      });
    } catch (err) {
      console.error("[cielo] createCheckout falhou", err);
      await supabaseAdmin.from("orders").update({ status: "cancelled" }).eq("id", orderId as string);
      throw new Error("Falha ao iniciar pagamento na Cielo");
    }

    await supabaseAdmin
      .from("orders")
      .update({
        cielo_checkout_url: checkout.checkoutUrl,
        cielo_merchant_order_id: checkout.merchantOrderId,
      } as never)
      .eq("id", orderId as string);

    return {
      orderId: orderId as string,
      checkoutUrl: checkout.checkoutUrl,
    };
  });

// Retomada do pagamento pendente (equivalente ao resumePendingPayment do MP)
export const resumeCieloPayment = createServerFn({ method: "POST" })
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
      .select("id, user_id, status, cielo_checkout_url, created_at")
      .eq("id", data.orderId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!order) throw new Error("Pedido não encontrado");
    if ((order as { user_id: string }).user_id !== context.userId) throw new Error("Sem permissão");
    if ((order as { status: string }).status !== "pending") {
      throw new Error((order as { status: string }).status === "paid" ? "Pedido já foi pago" : "Pedido expirado. Faça um novo pedido.");
    }

    const ageMs = Date.now() - new Date((order as { created_at: string }).created_at).getTime();
    if (ageMs > 5 * 60 * 1000) throw new Error("Pedido expirado. Faça um novo pedido.");

    const link = (order as { cielo_checkout_url: string | null }).cielo_checkout_url;
    if (!link) throw new Error("Link de pagamento indisponível");
    return { checkoutUrl: link };
  });
