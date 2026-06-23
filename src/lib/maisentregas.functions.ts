/**
 * Server functions e helpers reutilizáveis da Mais Entregas.
 *
 * Este arquivo é client-safe (importado pelo checkout/painel), portanto
 * NUNCA importe `@/lib/maisentregas.server` ou `client.server` no escopo
 * de módulo — sempre dentro de um `.handler()` com `await import(...)`.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ME_CITY = "pr/curitiba";
const ME_PAYMENT = "FATURADO" as const;
const ME_BILLING = "ENTREGA" as const;
const ME_DELIVERY = "IMEDIATO" as const;

function normalizePhone(v?: string | null) {
  return (v ?? "").replace(/\D/g, "");
}

function buildAddress(input: {
  street: string;
  number: string;
  complement?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
  zip: string;
  name?: string | null;
  phone?: string | null;
  comment?: string | null;
}) {
  return {
    street: input.street.trim(),
    number: input.number.trim(),
    complement: (input.complement ?? "").trim(),
    district: (input.district ?? "").trim(),
    city: (input.city ?? "Curitiba").trim(),
    state: (input.state ?? "PR").toUpperCase().trim(),
    cep: input.zip.replace(/\D/g, ""),
    zip: input.zip.replace(/\D/g, ""),
    name: (input.name ?? "").trim(),
    phone: normalizePhone(input.phone),
    comment: (input.comment ?? "").trim(),
  };
}

// =====================================================================
// quoteDelivery — cota o frete e valida cobertura para um endereço.
// Chamada do checkout. Requer login (evita abuso público da API paga).
// =====================================================================
export const quoteDelivery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    zip: string; street: string; number: string;
    district?: string; complement?: string; city?: string;
  }) => {
    const zip = (data?.zip ?? "").replace(/\D/g, "");
    if (zip.length !== 8) throw new Error("CEP inválido");
    if (!data.street || data.street.length < 2) throw new Error("Rua inválida");
    if (!data.number) throw new Error("Número inválido");
    return {
      zip,
      street: data.street.trim().slice(0, 120),
      number: String(data.number).trim().slice(0, 20),
      district: (data.district ?? "").trim().slice(0, 80),
      complement: (data.complement ?? "").trim().slice(0, 80),
      city: (data.city ?? "Curitiba").trim().slice(0, 60) || "Curitiba",
    };
  })
  .handler(async ({ data }) => {
    const me = await import("@/lib/maisentregas.server");
    const email = process.env.MAISENTREGAS_EMAIL;
    if (!email) throw new Error("Mais Entregas não configurada (falta MAISENTREGAS_EMAIL)");

    const res = await me.preconfirm({
      client: email,
      city: ME_CITY,
      payment: ME_PAYMENT,
      billing: ME_BILLING,
      delivery: ME_DELIVERY,
      address: [
        buildAddress({
          street: me.PICKUP_ADDRESS.street,
          number: me.PICKUP_ADDRESS.number,
          complement: me.PICKUP_ADDRESS.complement,
          district: me.PICKUP_ADDRESS.district,
          city: me.PICKUP_ADDRESS.city,
          state: me.PICKUP_ADDRESS.state,
          zip: me.PICKUP_ADDRESS.zip,
          name: me.PICKUP_ADDRESS.recipient_name,
          phone: me.PICKUP_ADDRESS.recipient_phone,
          comment: "coleta",
        }),
        buildAddress({
          street: data.street,
          number: data.number,
          complement: data.complement,
          district: data.district,
          city: data.city,
          state: "PR",
          zip: data.zip,
          comment: "entrega",
        }),
      ],
    });

    const fee = Number(res?.value ?? res?.billing?.value ?? 0);
    return {
      ok: true as const,
      fee,
      meOrderId: res.id ? String(res.id) : undefined,
    };
  });

// =====================================================================
// createDeliveryForOrder — chamado internamente após pagamento aprovado.
// Cria a corrida na Mais Entregas e salva o id da OS no pedido.
// Idempotente: se o pedido já tem maisentregas_order_id, retorna sem fazer nada.
// =====================================================================
export async function createDeliveryForOrder(orderId: string): Promise<{
  ok: boolean;
  reason?: string;
  meOrderId?: string;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const me = await import("@/lib/maisentregas.server");

  const { data: order, error } = await supabaseAdmin
    .from("orders")
    .select("id,status,fulfillment_status,delivery_method,customer_name,customer_phone,customer_email,customer_cpf,shipping_zip,shipping_street,shipping_number,shipping_complement,shipping_district,shipping_city,shipping_state,shipping_recipient_name,shipping_recipient_phone,maisentregas_order_id")
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!order) return { ok: false, reason: "order_not_found" };
  if (order.status !== "paid") return { ok: false, reason: "order_not_paid" };
  if (order.delivery_method !== "delivery") return { ok: false, reason: "pickup_order" };
  if (order.maisentregas_order_id) return { ok: true, meOrderId: order.maisentregas_order_id };
  // Só dispara a TBT Express quando o pedido está separado e pronto na expedição.
  const fs = (order as { fulfillment_status?: string | null }).fulfillment_status ?? "";
  if (fs !== "ready" && fs !== "shipped" && fs !== "completed") {
    return { ok: false, reason: "not_ready" };
  }
  if (!order.shipping_zip || !order.shipping_street || !order.shipping_number) {
    return { ok: false, reason: "missing_shipping_address" };
  }

  const email = process.env.MAISENTREGAS_EMAIL;
  if (!email) return { ok: false, reason: "missing_me_email" };

  try {
    const recipientName = order.shipping_recipient_name?.trim() || order.customer_name;
    const recipientPhone = normalizePhone(order.shipping_recipient_phone ?? order.customer_phone);
    const orderCode = order.id.slice(0, 8).toUpperCase();

    const confirmRes = await me.confirm({
      client: email,
      city: ME_CITY,
      payment: ME_PAYMENT,
      billing: ME_BILLING,
      delivery: ME_DELIVERY,
      order: `Pedido #${orderCode}`,
      document: order.customer_cpf ?? undefined,
      address: [
        buildAddress({
          street: me.PICKUP_ADDRESS.street,
          number: me.PICKUP_ADDRESS.number,
          complement: me.PICKUP_ADDRESS.complement,
          district: me.PICKUP_ADDRESS.district,
          city: me.PICKUP_ADDRESS.city,
          state: me.PICKUP_ADDRESS.state,
          zip: me.PICKUP_ADDRESS.zip,
          name: me.PICKUP_ADDRESS.recipient_name,
          phone: me.PICKUP_ADDRESS.recipient_phone,
          comment: `Coleta do pedido shopbox #${orderCode}`,
        }),
        buildAddress({
          street: order.shipping_street,
          number: order.shipping_number,
          complement: order.shipping_complement,
          district: order.shipping_district,
          city: order.shipping_city ?? "Curitiba",
          state: order.shipping_state ?? "PR",
          zip: order.shipping_zip,
          name: recipientName,
          phone: recipientPhone,
          comment: `Entrega do pedido shopbox #${orderCode}`,
        }),
      ],
    });

    const meOrderId = String(confirmRes.id ?? confirmRes.order ?? "");
    if (!meOrderId) {
      await supabaseAdmin.from("orders").update({
        maisentregas_last_error: "resposta sem id",
        maisentregas_last_check_at: new Date().toISOString(),
      }).eq("id", orderId);
      return { ok: false, reason: "no_id_in_response" };
    }

    await supabaseAdmin.from("orders").update({
      maisentregas_order_id: meOrderId,
      maisentregas_status: "criado",
      maisentregas_created_at: new Date().toISOString(),
      maisentregas_last_check_at: new Date().toISOString(),
      maisentregas_last_error: null,
    }).eq("id", orderId);

    console.info("[maisentregas] delivery created", { orderId, meOrderId });
    return { ok: true, meOrderId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[maisentregas] createDeliveryForOrder failed", { orderId, msg });
    await supabaseAdmin.from("orders").update({
      maisentregas_last_error: msg.slice(0, 800),
      maisentregas_last_check_at: new Date().toISOString(),
    }).eq("id", orderId);
    return { ok: false, reason: "api_error" };
  }
}

// =====================================================================
// pollOrderStatus — atualiza status de UMA entrega já criada.
// =====================================================================
export async function pollOrderStatus(orderRowId: string, meOrderId: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const me = await import("@/lib/maisentregas.server");
  try {
    const res = await me.getOrderStatus(meOrderId);
    const status = (res.ultimo_status_text ?? "").toString().trim() || null;
    const update: {
      maisentregas_last_check_at: string;
      maisentregas_last_error: string | null;
      maisentregas_status?: string;
    } = {
      maisentregas_last_check_at: new Date().toISOString(),
      maisentregas_last_error: null,
    };
    if (status) update.maisentregas_status = status;
    await supabaseAdmin.from("orders").update(update).eq("id", orderRowId);

    // Quando finalizado, marca o pedido como completed.
    if (me.isDeliveredStatus(status)) {
      await supabaseAdmin.from("orders").update({ fulfillment_status: "completed" }).eq("id", orderRowId);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[maisentregas] pollOrderStatus failed", { orderRowId, meOrderId, msg });
    await supabaseAdmin.from("orders").update({
      maisentregas_last_check_at: new Date().toISOString(),
      maisentregas_last_error: msg.slice(0, 800),
    }).eq("id", orderRowId);
  }
}

// =====================================================================
// cancelDeliveryForOrder — tenta cancelar uma corrida ativa.
// Chamado no fluxo de reembolso quando o pedido ainda não saiu.
// =====================================================================
export async function cancelDeliveryForOrder(orderId: string, reason?: string): Promise<{ ok: boolean; message?: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const me = await import("@/lib/maisentregas.server");

  const { data: order, error } = await supabaseAdmin
    .from("orders")
    .select("maisentregas_order_id, maisentregas_status")
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!order?.maisentregas_order_id) return { ok: false, message: "sem corrida" };

  const s = (order.maisentregas_status ?? "").toLowerCase().trim();
  if (me.isFinalStatus(s)) return { ok: false, message: "corrida já finalizada" };

  try {
    const res = await me.cancelOrder(order.maisentregas_order_id, reason ?? "Cancelado pelo lojista");
    if (res.success) {
      await supabaseAdmin.from("orders").update({
        maisentregas_status: "cancelado",
        maisentregas_last_check_at: new Date().toISOString(),
      }).eq("id", orderId);
    }
    return { ok: !!res.success, message: res.message };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[maisentregas] cancelDeliveryForOrder failed", { orderId, msg });
    return { ok: false, message: msg };
  }
}
