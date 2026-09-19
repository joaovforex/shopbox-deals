import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type CartItemInput = { product_id: string; quantity: number; color?: string | null };

// Venda manual (presencial): o pagamento JÁ foi recebido — na maquininha
// (crédito/débito), em dinheiro, Pix na hora, ou outro. Não existe mais link
// externo; a venda entra direto como PAGA, registrando a forma escolhida.
export const MANUAL_PAYMENT_METHODS = ["dinheiro", "pix", "credito", "debito", "outro"] as const;
export type ManualPaymentMethod = (typeof MANUAL_PAYMENT_METHODS)[number];

type CreateManualSaleInput = {
  customer_name: string;
  customer_phone: string;
  delivery_method: "pickup" | "delivery";
  payment_method?: ManualPaymentMethod;
  items: CartItemInput[];
};

export const createManualSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: CreateManualSaleInput) => {
    if (!data || typeof data !== "object") throw new Error("Payload inválido");
    if (!data.customer_name || data.customer_name.trim().length < 2) throw new Error("Nome inválido");
    const phone = (data.customer_phone ?? "").replace(/\D/g, "");
    if (!/^[0-9]{10,11}$/.test(phone)) throw new Error("Telefone inválido");
    if (!["pickup", "delivery"].includes(data.delivery_method)) throw new Error("Entrega inválida");
    const pm = (data.payment_method ?? "dinheiro") as ManualPaymentMethod;
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

    // Cria o pedido já baixando estoque. Passamos 'dinheiro' para o RPC porque é
    // o método que ele reconhece como PAGO na hora (balcão); logo abaixo gravamos
    // a forma real escolhida (dinheiro/pix/crédito/débito/outro) e marcamos o
    // provedor como 'manual' — assim a venda aparece separada nas métricas.
    const { data: orderId, error: orderErr } = await context.supabase.rpc(
      "create_manual_order" as never,
      {
        p_customer_name: data.customer_name.trim(),
        p_customer_phone: data.customer_phone,
        p_delivery_method: data.delivery_method,
        p_items: data.items,
        p_payment_method: "dinheiro",
      } as never,
    );
    if (orderErr || !orderId) throw new Error(orderErr?.message ?? "Falha ao registrar venda");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: updErr } = await supabaseAdmin
      .from("orders")
      .update({ payment_method: data.payment_method, payment_provider: "manual" } as never)
      .eq("id", orderId as string);
    if (updErr) {
      console.error("[manual-sale] falha ao gravar forma de pagamento", orderId, updErr.message);
    }

    return { orderId: orderId as string, paymentMethod: data.payment_method };
  });
