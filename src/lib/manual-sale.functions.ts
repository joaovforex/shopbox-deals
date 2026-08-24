import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { maxInstallmentsFor } from "@/lib/installments";

type CartItemInput = { product_id: string; quantity: number; color?: string | null };

export const MANUAL_PAYMENT_METHODS = ["cielo", "asaas", "pix", "card", "dinheiro"] as const;
export type ManualPaymentMethod = (typeof MANUAL_PAYMENT_METHODS)[number];

type CreateManualSaleInput = {
  customer_name: string;
  customer_phone: string;
  delivery_method: "pickup" | "delivery";
  payment_method?: ManualPaymentMethod;
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
    const pm = (data.payment_method ?? "cielo") as ManualPaymentMethod;
    if (!MANUAL_PAYMENT_METHODS.includes(pm)) throw new Error("Forma de pagamento inválida");
    if (!Array.isArray(data.items) || data.items.length === 0) throw new Error("Carrinho vazio");
    if (data.items.length > 50) throw new Error("Carrinho muito grande");
    for (const it of data.items) {
      if (!it.product_id || typeof it.product_id !== "string") throw new Error("Item inválido");
      if (!Number.isInteger(it.quantity) || it.quantity < 1 || it.quantity > 999) {
        throw new Error("Quantidade inválida");
      }
    }
    return { ...data, customer_phone: phone, payment_method: pm };
  })
  .handler(async ({ data, context }) => {
    // Verifica que é admin
    const { data: isAdmin } = await context.supabase.rpc("has_role" as never, {
      _user_id: context.userId,
      _role: "admin",
    } as never);
    if (!isAdmin) throw new Error("Sem permissão");

    const isCash = data.payment_method === "dinheiro";
    // Asaas fica como backup: só é usada quando explicitamente escolhida.
    const useAsaas = data.payment_method === "asaas";
    const provider = useAsaas ? "asaas" : "cielo";

    if (!isCash && useAsaas && !process.env.ASAAS_API_KEY) throw new Error("Asaas não configurada");
    if (!isCash && !useAsaas && (!process.env.CIELO_CLIENT_ID || !process.env.CIELO_CLIENT_SECRET)) {
      throw new Error("Cielo não configurada");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: orderId, error: orderErr } = await context.supabase.rpc(
      "create_manual_order" as never,
      {
        p_customer_name: data.customer_name.trim(),
        p_customer_phone: data.customer_phone,
        p_delivery_method: data.delivery_method,
        p_items: data.items,
        p_payment_method: data.payment_method,
      } as never,
    );
    if (orderErr || !orderId) throw new Error(orderErr?.message ?? "Falha ao criar pedido");

    // Venda em dinheiro: concluída no balcão, sem gateway.
    if (isCash) {
      return {
        orderId: orderId as string,
        initPoint: null as string | null,
        preferenceId: null as string | null,
      };
    }

    await supabaseAdmin
      .from("orders")
      .update({ payment_provider: provider } as never)
      .eq("id", orderId as string);

    const { data: orderRow } = await supabaseAdmin
      .from("orders")
      .select("total, delivery_fee")
      .eq("id", orderId as string)
      .maybeSingle();
    const total = Number((orderRow as { total?: number } | null)?.total ?? 0);
    const shippingFee = Number((orderRow as { delivery_fee?: number } | null)?.delivery_fee ?? 0);
    if (!(total > 0)) throw new Error("Pedido sem valor a cobrar");

    const origin = originFromRequest();
    const callbackOrigin = /^https:\/\/[^/]+\.[^/]+/.test(origin) ? origin : "https://shopboxonline.com";

    try {
      if (useAsaas) {
        const { createPaymentLink } = await import("@/lib/asaas.server");
        const link = await createPaymentLink({
          name: `Venda shopbox ${(orderId as string).slice(0, 8).toUpperCase()}`,
          value: total,
          description: `Venda manual para ${data.customer_name.trim()}`,
          maxInstallmentCount: maxInstallmentsFor(total),
        });

        await supabaseAdmin
          .from("orders")
          .update({
            mp_preference_id: link.id,
            mp_init_point: link.url,
            asaas_invoice_url: link.url,
          } as never)
          .eq("id", orderId as string);

        return { orderId: orderId as string, initPoint: link.url, preferenceId: link.id };
      }

      const { buildCieloCheckout } = await import("@/lib/cielo-checkout.server");
      const checkoutUrl = await buildCieloCheckout({
        orderId: orderId as string,
        productsTotal: Math.max(0, total - shippingFee),
        shippingFee: 0,
        shipping: null,
        customer: {
          name: data.customer_name.trim(),
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

      return { orderId: orderId as string, initPoint: checkoutUrl, preferenceId: "" };
    } catch (err) {
      console.error(`[manual-sale] ${provider} payment link error`, err);
      await supabaseAdmin.from("orders").update({ status: "cancelled" }).eq("id", orderId as string);
      throw new Error(err instanceof Error ? err.message : "Falha ao gerar cobrança");
    }
  });
