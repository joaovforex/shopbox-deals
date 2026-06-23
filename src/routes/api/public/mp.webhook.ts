import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";

export const Route = createFileRoute("/api/public/mp/webhook")({
  server: {
    handlers: {
      GET: async () => new Response("ok"),
      POST: async ({ request }) => {
        const rawBody = await request.text();
        const url = new URL(request.url);

        const dataId =
          url.searchParams.get("data.id") ??
          (() => {
            try {
              return (JSON.parse(rawBody) as { data?: { id?: string | number } })?.data?.id?.toString() ?? "";
            } catch {
              return "";
            }
          })();

        const type = url.searchParams.get("type") ?? (() => {
          try {
            return (JSON.parse(rawBody) as { type?: string })?.type ?? "";
          } catch {
            return "";
          }
        })();

        // O botão "Testar" do Mercado Pago costuma enviar um ID fictício.
        // Aceitamos só como health-check, sem processar pedido nem consultar APIs.
        if (type === "payment" && dataId === "123456") {
          console.info("[mp:webhook] mercado pago test notification accepted");
          return new Response("ok", { status: 200 });
        }

        const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
        const webhookSecret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
        if (!accessToken || !webhookSecret) {
          console.error("[mp:webhook] missing env");
          return new Response("config", { status: 500 });
        }

        // Mercado Pago manifesto: id:<data.id>;request-id:<x-request-id>;ts:<ts>;
        const xSignature = request.headers.get("x-signature") ?? "";
        const xRequestId = request.headers.get("x-request-id") ?? "";

        const sigParts = Object.fromEntries(
          xSignature.split(",").map((p) => {
            const [k, v] = p.split("=").map((s) => s.trim());
            return [k, v ?? ""];
          }),
        );
        const ts = sigParts["ts"];
        const v1 = sigParts["v1"];

        if (!ts || !v1 || !dataId) {
          console.warn("[mp:webhook] missing signature parts", { ts: !!ts, v1: !!v1, dataId: !!dataId });
          return new Response("bad signature", { status: 401 });
        }

        const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
        const expected = createHmac("sha256", webhookSecret).update(manifest).digest("hex");

        const a = Buffer.from(expected, "utf8");
        const b = Buffer.from(v1, "utf8");
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          console.warn("[mp:webhook] signature mismatch");
          return new Response("invalid signature", { status: 401 });
        }

        let payload: { type?: string; action?: string; data?: { id?: string | number } } = {};
        try {
          payload = JSON.parse(rawBody);
        } catch {
          // sometimes MP sends empty body and data via query
        }

        const eventType = payload.type ?? type;
        if (eventType !== "payment") {
          // Não processamos outros tipos por enquanto
          return new Response("ignored", { status: 200 });
        }

        // Busca detalhes do pagamento
        const payRes = await fetch(`https://api.mercadopago.com/v1/payments/${dataId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!payRes.ok) {
          console.error("[mp:webhook] fetch payment failed", payRes.status);
          return new Response("payment fetch failed", { status: 502 });
        }
        const payment = (await payRes.json()) as {
          id: number;
          status: string;
          external_reference?: string;
          payment_method_id?: string;
        };

        const orderId = payment.external_reference;
        if (!orderId) {
          console.warn("[mp:webhook] payment without external_reference");
          return new Response("ok", { status: 200 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Mapeia status MP -> ação no pedido
        // IMPORTANTE: pagamento "rejected" NÃO cancela o pedido — o cliente
        // pode tentar novamente (ex.: cair no Pix após cartão recusado).
        // Só "approved" finaliza como pago. Estornos/chargebacks finalizam
        // como cancelado. Demais status apenas registram o mp_payment_id.
        let action: "paid" | "cancelled" | "noop" = "noop";
        if (payment.status === "approved") action = "paid";
        else if (payment.status === "refunded" || payment.status === "charged_back") action = "cancelled";

        // Não rebaixa um pedido já pago/cancelado
        const { data: current } = await supabaseAdmin
          .from("orders")
          .select("status")
          .eq("id", orderId)
          .maybeSingle();
        if (!current) {
          console.warn("[mp:webhook] order not found", orderId);
          return new Response("ok", { status: 200 });
        }
        if (current.status === "paid" || current.status === "cancelled") {
          return new Response("already finalized", { status: 200 });
        }

        if (action === "paid") {
          // Debita estoque atomicamente; se faltar, marca como cancelado.
          const { data: result, error: rpcErr } = await supabaseAdmin.rpc(
            "confirm_order_paid" as never,
            { p_order_id: orderId, p_mp_payment_id: String(payment.id) } as never,
          );
          if (rpcErr) {
            console.error("[mp:webhook] confirm_order_paid error", rpcErr);
            return new Response("update failed", { status: 500 });
          }
          console.info("[mp:webhook] confirm result", result);

          if (result === "out_of_stock") {
            console.warn("[mp:webhook] auto-refund triggered for out_of_stock", { orderId, paymentId: payment.id });
            await autoRefundOutOfStock({ orderId, paymentId: String(payment.id), accessToken });
          } else if (result === "ok" || result === "already_paid") {
            // Não cria mais a corrida na Mais Entregas aqui.
            // O despacho para a TBT Express só acontece quando o pedido é
            // marcado como "Pronto" no painel de expedição.
          }

        } else if (action === "cancelled") {
          const { error: updErr } = await supabaseAdmin
            .from("orders")
            .update({ status: "cancelled", mp_payment_id: String(payment.id) })
            .eq("id", orderId);
          if (updErr) {
            console.error("[mp:webhook] cancel update error", updErr);
            return new Response("update failed", { status: 500 });
          }
        } else {
          // rejected / pending / in_process: apenas registra o mp_payment_id mais recente
          // sem mudar o status — o cliente ainda pode tentar pagar novamente.
          await supabaseAdmin
            .from("orders")
            .update({ mp_payment_id: String(payment.id) })
            .eq("id", orderId);
        }


        return new Response("ok", { status: 200 });
      },
    },
  },
});

async function autoRefundOutOfStock(args: { orderId: string; paymentId: string; accessToken: string }) {
  const { orderId, paymentId, accessToken } = args;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Já existe refund para esse pagamento? Idempotência defensiva.
    const { data: existing } = await supabaseAdmin
      .from("refunds")
      .select("id")
      .eq("mp_payment_id", paymentId)
      .maybeSingle();
    if (existing) {
      console.info("[mp:webhook] auto-refund skipped (already recorded)", { orderId, paymentId });
      return;
    }

    // Snapshot do pedido (já cancelado neste ponto pelo confirm_order_paid)
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id,total,customer_name,customer_email,customer_phone,customer_cpf,payment_method,created_at")
      .eq("id", orderId)
      .maybeSingle();
    if (!order) {
      console.error("[mp:webhook] auto-refund: order disappeared", { orderId });
      return;
    }

    const { data: items } = await supabaseAdmin
      .from("order_items")
      .select("product_name,variant_color,quantity,unit_price")
      .eq("order_id", orderId);

    const idempotencyKey = `auto-refund-oos-${orderId}`;
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}/refunds`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({}),
    });
    const mpJson: any = await mpRes.json().catch(() => ({}));
    if (!mpRes.ok) {
      console.error("[mp:webhook] auto-refund MP failed", { orderId, paymentId, status: mpRes.status, body: mpJson });
      return;
    }

    const itemsSnapshot = (items ?? []).map((it: any) => ({
      name: it.product_name,
      color: it.variant_color,
      quantity: it.quantity,
      unitPrice: Number(it.unit_price),
    }));

    const total = Number(order.total);
    const { error: insErr } = await supabaseAdmin.from("refunds").insert({
      order_id: order.id,
      mp_payment_id: paymentId,
      mp_refund_id: String(mpJson?.id ?? ""),
      amount: total,
      is_full: true,
      reason: "Estorno automático: estoque esgotou durante a confirmação do pagamento (race condition entre clientes). Cliente foi reembolsado integralmente sem precisar de ação manual.",
      customer_name: order.customer_name,
      customer_email: order.customer_email,
      customer_phone: order.customer_phone,
      customer_cpf: order.customer_cpf,
      payment_method: order.payment_method,
      order_total: total,
      order_created_at: order.created_at,
      items: itemsSnapshot,
      operator_id: null,
      operator_name: "Sistema / webhook MP (auto out_of_stock)",
    });
    if (insErr) {
      console.error("[mp:webhook] auto-refund history insert failed", insErr);
      return;
    }
    console.info("[mp:webhook] auto-refund completed", { orderId, paymentId, mpRefundId: mpJson?.id, amount: total });
  } catch (err) {
    console.error("[mp:webhook] auto-refund unexpected error", err);
  }
}
