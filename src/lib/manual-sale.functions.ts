import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type CartItemInput = { product_id: string; quantity: number; color?: string | null };

type CreateManualSaleInput = {
  customer_name: string;
  customer_phone: string;
  delivery_method: "pickup" | "delivery";
  items: CartItemInput[];
};

function originFromRequest(): string {
  const req = getRequest();
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("host") ?? "localhost";
  return `${proto}://${host}`;
}

export const createManualSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: CreateManualSaleInput) => {
    if (!data || typeof data !== "object") throw new Error("Payload inválido");
    if (!data.customer_name || data.customer_name.trim().length < 2) throw new Error("Nome inválido");
    const phone = (data.customer_phone ?? "").replace(/\D/g, "");
    if (!/^[0-9]{10,11}$/.test(phone)) throw new Error("Telefone inválido");
    if (!["pickup", "delivery"].includes(data.delivery_method)) throw new Error("Entrega inválida");
    if (!Array.isArray(data.items) || data.items.length === 0) throw new Error("Carrinho vazio");
    if (data.items.length > 50) throw new Error("Carrinho muito grande");
    for (const it of data.items) {
      if (!it.product_id || typeof it.product_id !== "string") throw new Error("Item inválido");
      if (!Number.isInteger(it.quantity) || it.quantity < 1 || it.quantity > 999) {
        throw new Error("Quantidade inválida");
      }
    }
    return { ...data, customer_phone: phone };
  })
  .handler(async ({ data, context }) => {
    // Verifica que é admin
    const { data: isAdmin } = await context.supabase.rpc("has_role" as never, {
      _user_id: context.userId,
      _role: "admin",
    } as never);
    if (!isAdmin) throw new Error("Sem permissão");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { createCheckout } = await import("@/lib/cielo.server");

    const { data: orderId, error: orderErr } = await context.supabase.rpc(
      "create_manual_order" as never,
      {
        p_customer_name: data.customer_name.trim(),
        p_customer_phone: data.customer_phone,
        p_delivery_method: data.delivery_method,
        p_items: data.items,
      } as never,
    );
    if (orderErr || !orderId) throw new Error(orderErr?.message ?? "Falha ao criar pedido");

    // Marca como Cielo
    await supabaseAdmin
      .from("orders")
      .update({ payment_provider: "cielo" } as never)
      .eq("id", orderId as string);

    const { data: orderItems, error: itemsErr } = await supabaseAdmin
      .from("order_items")
      .select("product_name, unit_price, quantity")
      .eq("order_id", orderId as string);
    if (itemsErr || !orderItems) throw new Error("Falha ao carregar itens");

    const cieloItems = orderItems.map((it) => ({
      name: String(it.product_name).slice(0, 128),
      unitPriceCents: Math.round(Number(it.unit_price) * 100),
      quantity: Number(it.quantity),
      sku: (orderId as string).slice(0, 40),
    }));

    const origin = originFromRequest();

    let checkout;
    try {
      checkout = await createCheckout({
        orderNumber: orderId as string,
        softDescriptor: "SHOPBOX",
        items: cieloItems,
        shipping: { type: "WithoutShipping" },
        maxInstallments: 7,
        returnUrl: `${origin}/pedido/${orderId}`,
        webhookUrl: `${origin}/api/public/cielo/webhook`,
        customer: {
          name: data.customer_name.trim(),
          phone: data.customer_phone,
        },
      });
    } catch (err) {
      console.error("[manual-sale] cielo checkout error", err);
      await supabaseAdmin.from("orders").update({ status: "cancelled" }).eq("id", orderId as string);
      throw new Error("Falha ao gerar cobrança na Cielo");
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
      // Mantém a chave "initPoint" para compatibilidade com a UI existente
      initPoint: checkout.checkoutUrl,
      preferenceId: checkout.merchantOrderId,
    };
  });
