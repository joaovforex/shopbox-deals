/**
 * Conversão retirada → entrega: o que fazer quando a cobrança do frete muda
 * de estado. Compartilhado pelos webhooks do Mercado Pago e do Asaas — a
 * regra de negócio é a mesma, só muda quem avisa.
 *
 * Server-only.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type UpgradePaymentEvent = {
  upgradeId: string;
  paymentId: string;
  status: string;
  isPaid: boolean;
  isCancel: boolean;
  /** Valor efetivamente pago (reais). Quando informado, precisa bater com o frete. */
  paidAmount?: number | null;
  source: "mercadopago" | "asaas";
};

export async function handleDeliveryUpgradePayment(ev: UpgradePaymentEvent): Promise<{ applied: boolean; reason?: string }> {
  const { upgradeId, paymentId, status, isPaid, isCancel, source } = ev;
  if (!upgradeId) return { applied: false, reason: "sem upgradeId" };
  const tag = `[${source}:webhook]`;

  const { data: upRow } = await supabaseAdmin
    .from("delivery_upgrades")
    .select("id, order_id, fee, status, shipping_street, shipping_number, shipping_district, shipping_city")
    .eq("id", upgradeId)
    .maybeSingle();
  if (!upRow) return { applied: false, reason: "upgrade não encontrado" };
  const up = upRow as {
    id: string; order_id: string; fee: number | null; status: string;
    shipping_street: string | null; shipping_number: string | null; shipping_district: string | null; shipping_city: string | null;
  };

  await supabaseAdmin
    .from("delivery_upgrades")
    .update({ mp_status: status, mp_payment_id: paymentId || null } as never)
    .eq("id", upgradeId);

  if (isCancel) {
    await supabaseAdmin
      .from("delivery_upgrades")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() } as never)
      .eq("id", upgradeId)
      .eq("status", "pending");
    return { applied: false, reason: "cancelado" };
  }
  if (!isPaid) return { applied: false, reason: `status ${status}` };
  if (up.status === "paid") return { applied: true, reason: "já aplicado" };

  // Segurança: o valor pago precisa bater com o frete cotado.
  if (ev.paidAmount != null) {
    const fee = Number(up.fee ?? 0);
    if (!(fee > 0) || Math.abs(ev.paidAmount - fee) > 0.02) {
      console.error(tag, "valor do frete divergente — upgrade NÃO aplicado", { upgradeId, paid: ev.paidAmount, fee });
      try {
        await supabaseAdmin.from("admin_notifications" as never).insert({
          type: "delivery_upgrade_amount_mismatch",
          title: `Frete pago com valor diferente #${String(up.order_id).slice(0, 8).toUpperCase()}`,
          body: `Pago R$ ${ev.paidAmount.toFixed(2)} e o frete cotado era R$ ${fee.toFixed(2)}. Conversão para entrega não aplicada — confira manualmente.`,
          order_id: up.order_id,
          metadata: { upgrade_id: upgradeId, payment_id: paymentId, source } as never,
        } as never);
      } catch { /* ignore */ }
      return { applied: false, reason: "valor divergente" };
    }
  }

  const { data: result, error } = await supabaseAdmin.rpc("apply_delivery_upgrade", {
    p_upgrade_id: upgradeId,
    p_mp_payment_id: paymentId || upgradeId,
  });
  if (error) {
    console.error(tag, "apply_delivery_upgrade error", error);
    return { applied: false, reason: error.message };
  }
  console.info(tag, "delivery upgrade applied", { upgradeId, result });

  // Pedido já separado/pronto passa a ser entrega: cria a corrida na TBT Express.
  try {
    const { createDeliveryForOrder } = await import("@/lib/maisentregas.functions");
    await createDeliveryForOrder(up.order_id);
  } catch (err) {
    console.error(tag, "maisentregas upgrade dispatch error", upgradeId, err);
  }

  try {
    const { data: ord } = await supabaseAdmin
      .from("orders")
      .select("id, customer_name, customer_phone, total")
      .eq("id", up.order_id)
      .maybeSingle();
    const name = ord?.customer_name ?? "Cliente";
    const shortId = String(up.order_id).slice(0, 8).toUpperCase();
    const street = [up.shipping_street, up.shipping_number].filter(Boolean).join(", ");
    const addrParts = [street, up.shipping_district, up.shipping_city].filter(Boolean);
    await supabaseAdmin.from("admin_notifications" as never).insert({
      type: "delivery_upgrade_paid",
      title: `Upgrade para entrega confirmado #${shortId}`,
      body: `${name} pagou o frete e o pedido foi movido para entrega.${addrParts.length ? ` Endereço: ${addrParts.join(", ")}.` : ""}`,
      order_id: up.order_id,
      metadata: {
        upgrade_id: upgradeId,
        payment_id: paymentId || null,
        source,
        customer_phone: ord?.customer_phone ?? null,
        total: ord?.total ?? null,
      } as never,
    } as never);
  } catch (notifErr) {
    console.warn(tag, "admin notification insert failed", notifErr);
  }

  return { applied: true };
}
