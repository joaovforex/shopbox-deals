/**
 * Server functions e helpers reutilizáveis da Mais Entregas.
 *
 * Este arquivo é client-safe (importado pelo checkout/painel), portanto
 * NUNCA importe `@/lib/maisentregas.server` ou `client.server` no escopo
 * de módulo — sempre dentro de um `.handler()` com `await import(...)`.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// =====================================================================
// quoteDelivery — cota o frete e valida cobertura para um CEP de Curitiba.
// Chamada do checkout. Requer login (evita abuso público da API paga).
// =====================================================================
export const quoteDelivery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    zip: string; street: string; number: string;
    district?: string; complement?: string;
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
    };
  })
  .handler(async ({ data }) => {
    const me = await import("@/lib/maisentregas.server");
    const res = await me.preconfirm({
      city: "pr/curitiba",
      delivery: { type: "immediate" },
      address: [
        {
          zip: me.PICKUP_ADDRESS.zip,
          street: me.PICKUP_ADDRESS.street,
          number: me.PICKUP_ADDRESS.number,
          complement: me.PICKUP_ADDRESS.complement,
          district: me.PICKUP_ADDRESS.district,
          city: me.PICKUP_ADDRESS.city,
          state: me.PICKUP_ADDRESS.state,
        },
        {
          zip: data.zip,
          street: data.street,
          number: data.number,
          complement: data.complement,
          district: data.district,
          city: "Curitiba",
          state: "pr",
        },
      ],
    });
    const fee = Number(res.total ?? res.price ?? res.value ?? 0);
    return {
      ok: true as const,
      fee,
    };
  });


// =====================================================================
// createDeliveryForOrder — chamado internamente após pagamento aprovado.
// Cria a corrida na Mais Entregas e salva tracking no pedido.
// Idempotente: se o pedido já tem maisentregas_order_id, retorna sem fazer nada.
// =====================================================================
export async function createDeliveryForOrder(orderId: string): Promise<{
  ok: boolean;
  reason?: string;
  meOrderId?: string;
  trackingUrl?: string;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const me = await import("@/lib/maisentregas.server");

  const { data: order, error } = await supabaseAdmin
    .from("orders")
    .select(
      "id,status,delivery_method,customer_name,customer_phone,customer_email,customer_cpf," +
      "shipping_zip,shipping_street,shipping_number,shipping_complement,shipping_district," +
      "shipping_city,shipping_state,shipping_recipient_name,shipping_recipient_phone," +
      "maisentregas_order_id",
    )
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!order) return { ok: false, reason: "order_not_found" };
  if (order.status !== "paid") return { ok: false, reason: "order_not_paid" };
  if (order.delivery_method !== "delivery") return { ok: false, reason: "pickup_order" };
  if (order.maisentregas_order_id) return { ok: true, meOrderId: order.maisentregas_order_id };
  if (!order.shipping_zip || !order.shipping_street || !order.shipping_number) {
    return { ok: false, reason: "missing_shipping_address" };
  }

  try {
    const recipientName = order.shipping_recipient_name?.trim() || order.customer_name;
    const recipientPhone = (order.shipping_recipient_phone ?? order.customer_phone ?? "").replace(/\D/g, "");

    const confirmRes = await me.confirm({
      city: "pr/curitiba",
      delivery: { type: "immediate" },
      client: {
        name: order.customer_name,
        document: order.customer_cpf ?? "",
        phone: (order.customer_phone ?? "").replace(/\D/g, ""),
        email: order.customer_email ?? undefined,
      },
      payment: { modality: "sender", method: "billed" },
      billing: { external_reference: order.id },
      address: [
        {
          zip: me.PICKUP_ADDRESS.zip,
          street: me.PICKUP_ADDRESS.street,
          number: me.PICKUP_ADDRESS.number,
          complement: me.PICKUP_ADDRESS.complement,
          district: me.PICKUP_ADDRESS.district,
          city: me.PICKUP_ADDRESS.city,
          state: me.PICKUP_ADDRESS.state,
          recipient_name: me.PICKUP_ADDRESS.recipient_name,
          recipient_phone: me.PICKUP_ADDRESS.recipient_phone,
        },
        {
          zip: (order.shipping_zip ?? "").replace(/\D/g, ""),
          street: order.shipping_street ?? "",
          number: order.shipping_number ?? "",
          complement: order.shipping_complement ?? "",
          district: order.shipping_district ?? "",
          city: order.shipping_city ?? "Curitiba",
          state: (order.shipping_state ?? "PR").toLowerCase(),
          recipient_name: recipientName,
          recipient_phone: recipientPhone,
        },
      ],
    });

    const meOrderId = String(confirmRes.id ?? confirmRes.order_id ?? "");
    const trackingUrl = (confirmRes.tracking_url ?? confirmRes.url ?? null) as string | null;
    if (!meOrderId) {
      await supabaseAdmin.from("orders").update({
        maisentregas_last_error: "resposta sem id",
        maisentregas_last_check_at: new Date().toISOString(),
      }).eq("id", orderId);
      return { ok: false, reason: "no_id_in_response" };
    }

    await supabaseAdmin.from("orders").update({
      maisentregas_order_id: meOrderId,
      maisentregas_tracking_url: trackingUrl,
      maisentregas_status: "criado",
      maisentregas_created_at: new Date().toISOString(),
      maisentregas_last_check_at: new Date().toISOString(),
      maisentregas_last_error: null,
    }).eq("id", orderId);

    console.info("[maisentregas] delivery created", { orderId, meOrderId });
    return { ok: true, meOrderId, trackingUrl: trackingUrl ?? undefined };
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
    const status = (res.ultimo_status_text ?? res.status ?? "")?.toString().toLowerCase().trim() || null;
    const trackingUrl = (res.tracking_url ?? res.url ?? null) as string | null;
    const update: Record<string, unknown> = {
      maisentregas_last_check_at: new Date().toISOString(),
      maisentregas_last_error: null,
    };
    if (status) update.maisentregas_status = status;
    if (trackingUrl) update.maisentregas_tracking_url = trackingUrl;
    await supabaseAdmin.from("orders").update(update).eq("id", orderRowId);

    // Quando entregue, marca o pedido como completed
    if (me.isFinalStatus(status) && status?.startsWith("entregue")) {
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
