import { createFileRoute } from "@tanstack/react-router";
import { safeCompare } from "@/lib/safe-compare.server";

const PAID_EVENTS = new Set(["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"]);
const CANCEL_EVENTS = new Set([
  "PAYMENT_OVERDUE",
  "PAYMENT_DELETED",
  "PAYMENT_REFUNDED",
  "PAYMENT_CHARGEBACK",
  "PAYMENT_REFUND_REQUESTED",
]);

export const Route = createFileRoute("/api/public/asaas/webhook")({
  server: {
    handlers: {
      GET: async () => new Response("ok"),
      POST: async ({ request }) => {
        try {
          const expected = (process.env.ASAAS_WEBHOOK_TOKEN ?? "").trim();
          const token = (
            request.headers.get("asaas-access-token") ??
            request.headers.get("asaas_access_token") ??
            request.headers.get("access-token") ??
            request.headers.get("access_token") ??
            ""
          ).trim();
          const tokenOk = expected.length > 0 && safeCompare(token, expected);

          const payload = (await request.json().catch(() => null)) as
            | {
                event?: string;
                payment?: {
                  id?: string;
                  externalReference?: string | null;
                  status?: string;
                  paymentLink?: string | null;
                  billingType?: string | null;
                };
              }
            | null;

          const event = payload?.event ?? "";
          const payment = payload?.payment;
          const reference = payment?.externalReference ?? "";
          const paymentId = payment?.id ?? "";
          const paymentLinkId = payment?.paymentLink ?? "";
          let isPaid = false;
          let isCancel = false;

          // Fallback seguro: se o token não bater, confirmamos o evento
          // diretamente na API do Asaas antes de processar. Isso mantém a
          // confirmação instantânea mesmo com o token desalinhado.
          if (!tokenOk) {
            if (!paymentId) {
              console.warn("[asaas:webhook] invalid token and no paymentId", {
                received_len: token.length,
                expected_len: expected.length,
              });
              return new Response("unauthorized", { status: 401 });
            }
            try {
              const { getPayment } = await import("@/lib/asaas.server");
              const remote = await getPayment(paymentId);
              if (!remote?.id) {
                return new Response("unauthorized", { status: 401 });
              }
              if (payment) payment.status = remote.status ?? payment.status;
              // No caminho de fallback, a requisição pode ser forjada; o status
              // remoto da Asaas é a única fonte confiável.
              const remoteStatus = remote.status ?? "";
              isPaid = ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(remoteStatus);
              isCancel = [
                "REFUNDED",
                "REFUND_REQUESTED",
                "CHARGEBACK_REQUESTED",
                "CHARGEBACK_DISPUTE",
                "OVERDUE",
                "DELETED",
              ].includes(remoteStatus);
              console.info("[asaas:webhook] token mismatch — verified via API", {
                paymentId,
                status: remote.status,
              });
            } catch (verifyErr) {
              console.warn("[asaas:webhook] API verification failed", verifyErr);
              return new Response("unauthorized", { status: 401 });
            }
          }

          if (!event || (!reference && !paymentLinkId)) {
            return new Response("ok", { status: 200 });
          }

          if (tokenOk) {
            isPaid = PAID_EVENTS.has(event);
            isCancel = CANCEL_EVENTS.has(event);
          }

          // === Eventos de ESTORNO ===
          // A devolução Pix é assíncrona e pode ser CANCELADA pelo banco do
          // cliente depois de criada. Refletimos isso no histórico para nunca
          // dar como concluído um estorno que não chegou ao cliente.
          if (REFUND_EVENTS.has(event) && paymentId) {
            try {
              const { applyRefundWebhookEvent } = await import("@/lib/refund-sync.server");
              await applyRefundWebhookEvent(paymentId, event);
            } catch (err) {
              console.error("[asaas:webhook] refund event error", err);
            }
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");


          // === Caixa QR / venda manual via link de pagamento ===
          if (paymentLinkId) {
            const { data: charge } = await supabaseAdmin
              .from("pos_charges")
              .select("id")
              .eq("mp_preference_id", paymentLinkId)
              .maybeSingle();
            if (charge) {
              const patch: Record<string, unknown> = {
                mp_payment_id: paymentId || null,
                mp_status: payment?.status ?? event,
                mp_payment_method_id: payment?.billingType ?? null,
                status: isPaid ? "paid" : isCancel ? "refunded" : "pending",
                last_event_at: new Date().toISOString(),
              };
              if (isPaid) patch.paid_at = new Date().toISOString();
              await supabaseAdmin.from("pos_charges").update(patch as never).eq("id", (charge as { id: string }).id);
              return new Response("ok", { status: 200 });
            }

            const { data: upgradeByLink } = await supabaseAdmin
              .from("delivery_upgrades")
              .select("id")
              .eq("mp_preference_id", paymentLinkId)
              .maybeSingle();
            if (upgradeByLink) {
              await handleUpgrade(supabaseAdmin, (upgradeByLink as { id: string }).id, paymentId, payment?.status ?? event, isPaid, isCancel);
              return new Response("ok", { status: 200 });
            }

            const { data: manualOrder } = await supabaseAdmin
              .from("orders")
              .select("id")
              .eq("mp_preference_id", paymentLinkId)
              .maybeSingle();
            if (manualOrder) {
              await handleOrder(supabaseAdmin, (manualOrder as { id: string }).id, paymentId, payment?.status ?? event, isPaid, isCancel);
              return new Response("ok", { status: 200 });
            }
            return new Response("ok", { status: 200 });
          }

          // === Conversão retirada → entrega ===
          if (reference.startsWith("upgrade:")) {
            await handleUpgrade(supabaseAdmin, reference.slice("upgrade:".length), paymentId, payment?.status ?? event, isPaid, isCancel);
            return new Response("ok", { status: 200 });
          }

          await handleOrder(supabaseAdmin, reference, paymentId, payment?.status ?? event, isPaid, isCancel);


          return new Response("ok", { status: 200 });
        } catch (err) {
          console.error("[asaas:webhook] unexpected error", err);
          return new Response("ok", { status: 200 });
        }
      },
    },
  },
});

/* eslint-disable @typescript-eslint/no-explicit-any */
async function handleOrder(
  admin: any,
  orderId: string,
  paymentId: string,
  status: string,
  isPaid: boolean,
  isCancel: boolean,
): Promise<void> {
  if (!orderId) return;
  await admin
    .from("orders")
    .update({
      asaas_status: status,
      asaas_payment_id: paymentId || null,
      mp_payment_status: isPaid ? "approved" : status,
      mp_last_attempt_at: new Date().toISOString(),
    })
    .eq("id", orderId);

  const { data: current } = await admin
    .from("orders")
    .select("status, cancellation_reason")
    .eq("id", orderId)
    .maybeSingle();
  if (!current || current.status === "paid") return;
  // Pedido cancelado por expiração automática pode ser "ressuscitado" quando
  // o pagamento confirma logo depois.
  if (
    current.status === "cancelled" &&
    !(isPaid && (current.cancellation_reason === "expired" || !current.cancellation_reason))
  ) {
    return;
  }


  if (isPaid) {
    const { data: result, error } = await admin.rpc("confirm_order_paid", {
      p_order_id: orderId,
      p_mp_payment_id: paymentId || orderId,
    });
    if (error) {
      console.error("[asaas:webhook] confirm_order_paid error", error);
      return;
    }
    console.info("[asaas:webhook] order confirmed", { orderId, result });
    if (result === "ok" || result === "already_paid") {
      try {
        const { createDeliveryForOrder } = await import("@/lib/maisentregas.functions");
        await createDeliveryForOrder(orderId);
      } catch (err) {
        console.error("[asaas:webhook] maisentregas create error", orderId, err);
      }
    }
  } else if (isCancel) {
    // O trigger restore_stock_on_cancel cuida da devolução de estoque.
    const { error } = await admin
      .from("orders")
      .update({ status: "cancelled", cancellation_reason: `asaas:${status}` })
      .eq("id", orderId)
      .eq("status", "pending");
    if (error) console.error("[asaas:webhook] cancel error", error);
  }
}

async function handleUpgrade(
  admin: any,
  upgradeId: string,
  paymentId: string,
  status: string,
  isPaid: boolean,
  isCancel: boolean,
): Promise<void> {
  if (!upgradeId) return;
  await admin
    .from("delivery_upgrades")
    .update({ mp_status: status, mp_payment_id: paymentId || null })
    .eq("id", upgradeId);

  if (isPaid) {
    const { data: result, error } = await admin.rpc("apply_delivery_upgrade", {
      p_upgrade_id: upgradeId,
      p_mp_payment_id: paymentId || upgradeId,
    });
    if (error) {
      console.error("[asaas:webhook] apply_delivery_upgrade error", error);
      return;
    }
    console.info("[asaas:webhook] delivery upgrade applied", { upgradeId, result });

    try {
      const { data: up } = await admin
        .from("delivery_upgrades")
        .select("order_id, fee, shipping_street, shipping_number, shipping_district, shipping_city")
        .eq("id", upgradeId)
        .maybeSingle();
      if (up?.order_id) {
        const { data: ord } = await admin
          .from("orders")
          .select("id, customer_name, customer_phone, total")
          .eq("id", up.order_id)
          .maybeSingle();
        const name = ord?.customer_name ?? "Cliente";
        const shortId = String(up.order_id).slice(0, 8).toUpperCase();
        const street = [up.shipping_street, up.shipping_number].filter(Boolean).join(", ");
        const addrParts = [street, up.shipping_district, up.shipping_city].filter(Boolean);
        await admin.from("admin_notifications").insert({
          type: "delivery_upgrade_paid",
          title: `Upgrade para entrega confirmado #${shortId}`,
          body: `${name} pagou o frete e o pedido foi movido para entrega.${addrParts.length ? ` Endereço: ${addrParts.join(", ")}.` : ""}`,
          order_id: up.order_id,
          metadata: {
            upgrade_id: upgradeId,
            asaas_payment_id: paymentId || null,
            customer_phone: ord?.customer_phone ?? null,
            total: ord?.total ?? null,
          },
        });
      }
    } catch (notifErr) {
      console.warn("[asaas:webhook] admin notification insert failed", notifErr);
    }
  } else if (isCancel) {
    await admin
      .from("delivery_upgrades")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("id", upgradeId)
      .eq("status", "pending");
  }
}
