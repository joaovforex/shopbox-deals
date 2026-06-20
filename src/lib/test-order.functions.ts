/**
 * Pedido de teste (apenas Super Admin).
 * Cria um pedido fake "paid" com endereço em Curitiba e dispara o fluxo
 * de criação de corrida na Mais Entregas (preconfirm/confirm).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createDeliveryForOrder } from "@/lib/maisentregas.functions";

export const createTestDelivery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: isAdmin, error: roleErr } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (roleErr) throw new Error(roleErr.message);
    if (!isAdmin) throw new Error("Apenas Super Admin pode gerar pedido de teste.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const stamp = new Date().toISOString().slice(11, 19);
    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .insert({
        user_id: userId,
        customer_name: `TESTE ${stamp}`,
        customer_email: "teste@shopbox.local",
        customer_phone: "41999999999",
        customer_cpf: "00000000000",
        payment_method: "pix",
        status: "paid",
        total: 1,
        delivery_method: "delivery",
        delivery_fee: 0,
        shipping_zip: "80020310",
        shipping_street: "Rua XV de Novembro",
        shipping_number: "100",
        shipping_complement: "Pedido de teste",
        shipping_district: "Centro",
        shipping_city: "Curitiba",
        shipping_state: "PR",
        shipping_recipient_name: `TESTE ${stamp}`,
        shipping_recipient_phone: "41999999999",
        fulfillment_status: "pending",
      })
      .select("id")
      .single();

    if (error || !order) throw new Error(error?.message ?? "Falha ao criar pedido de teste");

    const res = await createDeliveryForOrder(order.id);
    return {
      orderId: order.id,
      meOrderId: res.meOrderId,
      ok: res.ok,
      reason: res.reason,
    };
  });
