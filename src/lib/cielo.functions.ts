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

type CreateCieloInput = {
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  customer_cpf: string;
  delivery_method: "pickup" | "delivery";
  shipping?: ShippingInput | null;
  items: CartItemInput[];
  save_profile?: boolean;
  use_cashback?: number;
};

function originFromRequest(): string {
  const req = getRequest();
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("host") ?? "localhost";
  return `${proto}://${host}`;
}

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

export const createCieloPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: CreateCieloInput) => {
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
    if (!process.env.CIELO_CLIENT_ID || !process.env.CIELO_CLIENT_SECRET) {
      throw new Error("Cielo não configurada");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { buildCieloCheckout } = await import("@/lib/cielo-checkout.server");

    await supabaseAdmin.rpc("expire_stale_pending_orders" as never, { p_minutes: 20 } as never);

    // Bloqueio anti-duplicidade
    {
      const productIds = Array.from(new Set(data.items.map((i) => i.product_id)));
      const { data: pendingOrders } = await supabaseAdmin
        .from("orders")
        .select("id, created_at, cielo_checkout_url, order_items!inner(product_id)")
        .eq("user_id", context.userId)
        .eq("status", "pending")
        .in("order_items.product_id", productIds)
        .order("created_at", { ascending: false })
        .limit(1);
      const existing = (pendingOrders ?? [])[0] as
        | { id: string; cielo_checkout_url: string | null }
        | undefined;
      if (existing?.cielo_checkout_url) {
        const err = new Error(
          "Você já tem um checkout em andamento para um destes produtos. Finalize ou aguarde alguns minutos antes de tentar novamente.",
        ) as Error & { existing_order_id?: string; existing_init_point?: string | null };
        err.existing_order_id = existing.id;
        err.existing_init_point = existing.cielo_checkout_url;
        throw err;
      }
      if (existing) {
        await supabaseAdmin
          .from("orders")
          .update({ status: "cancelled", cancellation_reason: "checkout_incompleto" } as never)
          .eq("id", existing.id)
          .eq("status", "pending");
      }
    }

    // 1) Pedido pendente
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
    if (orderErr || !orderId) throw new Error(orderErr?.message ?? "Falha ao criar pedido");

    const orderUpdate: Record<string, unknown> = { payment_provider: "cielo" };
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

    // Perfil
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

    // 2) Itens / totais
    const { data: orderItems, error: itemsErr } = await supabaseAdmin
      .from("order_items")
      .select("product_name, unit_price, quantity")
      .eq("order_id", orderId as string);
    if (itemsErr || !orderItems) throw new Error("Falha ao carregar itens do pedido");

    const subtotal = orderItems.reduce(
      (acc, it) => acc + Number(it.unit_price) * Number(it.quantity),
      0,
    );
    const shippingFee = data.delivery_method === "delivery" ? 12 : 0;

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

    // 100% cashback: não passa pelo gateway
    if (grandTotal <= 0) {
      const { data: confirmResult, error: confirmErr } = await supabaseAdmin.rpc(
        "confirm_order_paid" as never,
        { p_order_id: orderId as string, p_mp_payment_id: `cashback-only:${orderId}` } as never,
      );
      if (confirmErr) {
        await supabaseAdmin.rpc("refund_cashback_for_order" as never, { p_order_id: orderId as string } as never);
        await supabaseAdmin.from("orders").update({ status: "cancelled" } as never).eq("id", orderId as string);
        throw new Error("Falha ao finalizar pedido pago com cashback. Tente novamente.");
      }
      if (confirmResult === "out_of_stock") {
        await supabaseAdmin.rpc("refund_cashback_for_order" as never, { p_order_id: orderId as string } as never);
        throw new Error("Um dos itens ficou sem estoque. Seu cashback foi devolvido.");
      }
      await supabaseAdmin
        .from("orders")
        .update({
          payment_method: "cashback",
          mp_payment_status: "approved",
          mp_last_attempt_at: new Date().toISOString(),
        } as never)
        .eq("id", orderId as string);
      return {
        orderId: orderId as string,
        preferenceId: "",
        initPoint: `${origin}/pedido/${orderId}`,
      };
    }

    try {
      const callbackOrigin = isPublicHttpsOrigin(origin) ? origin : "https://shopboxonline.com";
      const checkoutUrl = await buildCieloCheckout({
        orderId: orderId as string,
        productsTotal,
        shippingFee,
        shipping: data.delivery_method === "delivery" ? data.shipping ?? null : null,
        customer: {
          name: data.customer_name,
          email: data.customer_email,
          identity: data.customer_cpf,
          phone: data.customer_phone,
        },
        returnUrl: `${callbackOrigin}/pedido/${orderId}`,
      });

      await supabaseAdmin
        .from("orders")
        .update({
          cielo_checkout_url: checkoutUrl,
          cielo_status: "pending",
          mp_init_point: checkoutUrl,
        } as never)
        .eq("id", orderId as string);

      return { orderId: orderId as string, preferenceId: "", initPoint: checkoutUrl };
    } catch (err) {
      console.error("[cielo] create checkout failed", err);
      try {
        await supabaseAdmin.rpc("refund_cashback_for_order" as never, { p_order_id: orderId as string } as never);
      } catch (refundErr) {
        console.error("[cielo] cashback refund on failure error", refundErr);
      }
      await supabaseAdmin.from("orders").update({ status: "cancelled" } as never).eq("id", orderId as string);
      throw new Error(err instanceof Error ? err.message : "Falha ao iniciar pagamento");
    }
  });

/** Retoma o pagamento de um pedido pendente da Cielo. */
export const resumeCieloPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { orderId: string }) => {
    if (!data?.orderId || !/^[0-9a-f-]{36}$/i.test(data.orderId)) throw new Error("Pedido inválido");
    return data;
  })
  .handler(async ({ data, context }) => {
    if (!process.env.CIELO_CLIENT_ID) throw new Error("Cielo não configurada");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { buildCieloCheckout } = await import("@/lib/cielo-checkout.server");

    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select(
        "id,user_id,status,total,delivery_fee,customer_name,customer_email,customer_phone,customer_cpf,cielo_checkout_url,shipping_zip,shipping_street,shipping_number,shipping_complement,shipping_district,shipping_city,shipping_state",
      )
      .eq("id", data.orderId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!order) throw new Error("Pedido não encontrado");
    if (order.user_id && order.user_id !== context.userId) throw new Error("Sem permissão");
    if (order.status !== "pending") throw new Error("Este pedido não está mais aguardando pagamento");

    if (order.cielo_checkout_url) {
      return { orderId: order.id, initPoint: order.cielo_checkout_url as string };
    }

    const total = Number(order.total ?? 0);
    if (!(total > 0)) throw new Error("Pedido sem valor a pagar");
    const shippingFee = Number(order.delivery_fee ?? 0);

    const origin = originFromRequest();
    const callbackOrigin = isPublicHttpsOrigin(origin) ? origin : "https://shopboxonline.com";

    const checkoutUrl = await buildCieloCheckout({
      orderId: order.id,
      productsTotal: Math.max(0, total - shippingFee),
      shippingFee,
      shipping:
        shippingFee > 0 && order.shipping_street && order.shipping_city
          ? {
              zip: String(order.shipping_zip ?? ""),
              street: String(order.shipping_street),
              number: String(order.shipping_number ?? "S/N"),
              complement: order.shipping_complement,
              district: order.shipping_district,
              city: String(order.shipping_city),
              state: String(order.shipping_state ?? "PR"),
            }
          : null,
      customer: {
        name: String(order.customer_name ?? "Cliente"),
        email: order.customer_email ?? undefined,
        identity: order.customer_cpf ?? undefined,
        phone: order.customer_phone ?? undefined,
      },
      returnUrl: `${callbackOrigin}/pedido/${order.id}`,
    });

    await supabaseAdmin
      .from("orders")
      .update({ cielo_checkout_url: checkoutUrl, cielo_status: "pending", mp_init_point: checkoutUrl } as never)
      .eq("id", order.id);

    return { orderId: order.id, initPoint: checkoutUrl };
  });
