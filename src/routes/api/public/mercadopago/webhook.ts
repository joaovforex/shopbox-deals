import { createFileRoute } from "@tanstack/react-router";

/**
 * Webhook (notificação) do Mercado Pago (Checkout Pro).
 *
 * O MP notifica com `type=payment` (id do pagamento) ou `topic=merchant_order`.
 * Reconsultamos SEMPRE a API do MP (nunca confiamos só no push) e casamos o
 * pagamento ao pedido pelo `external_reference` (= UUID do nosso pedido).
 *
 * Regra de ouro: SEMPRE responder 200 para o MP não pausar a fila de notificações.
 * Falhas geram um alerta em `admin_notifications` para acompanhamento.
 */
export const Route = createFileRoute("/api/public/mercadopago/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startedAt = Date.now();
        try {
          const outcome = await handleMpNotification(request);
          console.info("[mp:webhook]", JSON.stringify({ ...outcome, ms: Date.now() - startedAt }));
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("[mp:webhook] unexpected", message, err);
          await alertFailure("exception", message, { ms: Date.now() - startedAt });
        }
        return new Response("ok", { status: 200 });
      },
      GET: async () => new Response("ok", { status: 200 }),
    },
  },
});

type Outcome = { stage: string; status: "ok" | "ignored" | "error"; detail?: string; orderId?: string };

async function alertFailure(
  stage: string,
  detail: string,
  metadata: Record<string, unknown> = {},
  orderId?: string | null,
): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("admin_notifications" as never).insert({
      type: "mercadopago_webhook_error",
      title: "Falha no webhook do Mercado Pago",
      body: `${stage}: ${detail}`.slice(0, 500),
      order_id: orderId ?? null,
      metadata: { stage, detail, ...metadata } as never,
    } as never);
  } catch (err) {
    console.error("[mp:webhook] falha ao criar alerta", err);
  }
}

async function parseNotification(request: Request): Promise<{ type: string; id: string }> {
  const url = new URL(request.url);
  const q = url.searchParams;
  let bodyType = "";
  let bodyId = "";
  try {
    const raw = await request.text();
    if (raw) {
      const json = JSON.parse(raw) as Record<string, unknown>;
      bodyType = String(json.type ?? json.topic ?? "");
      const dataObj = (json.data ?? null) as Record<string, unknown> | null;
      bodyId = dataObj?.id != null ? String(dataObj.id) : json.id != null ? String(json.id) : "";
    }
  } catch {
    /* corpo pode vir vazio — os dados chegam na query */
  }
  const type = bodyType || q.get("type") || q.get("topic") || "";
  const id = bodyId || q.get("data.id") || q.get("id") || "";
  return { type: type.toLowerCase(), id };
}

async function handleMpNotification(request: Request): Promise<Outcome> {
  const { type, id } = await parseNotification(request);
  if (!id) {
    return { stage: "parse", status: "ignored", detail: "notificação sem id" };
  }

  const { getPayment, getMerchantOrder, mapMpStatus, mpPaymentTypeToMethod } = await import("@/lib/mercadopago.server");

  // Resolve o pagamento (direto ou via merchant_order).
  let payment: Awaited<ReturnType<typeof getPayment>> = null;
  if (type.includes("merchant_order")) {
    const mo = await getMerchantOrder(id);
    const approved = (mo?.payments ?? []).find((p) => p.status.toLowerCase() === "approved")
      ?? (mo?.payments ?? [])[mo && mo.payments.length ? mo.payments.length - 1 : 0];
    if (approved?.id) payment = await getPayment(approved.id);
  } else {
    // type "payment" (ou vazio) — o id é do pagamento.
    payment = await getPayment(id);
  }

  if (!payment) {
    const outcome: Outcome = { stage: "consulta-mp", status: "error", detail: "pagamento não encontrado no MP" };
    await alertFailure("consulta-mp", "Pagamento não encontrado no Mercado Pago", { type, id });
    return outcome;
  }

  const orderId = payment.externalReference ?? "";
  if (!orderId) {
    return { stage: "consulta-mp", status: "ignored", detail: "pagamento sem external_reference (provável cobrança fora da loja)" };
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("id,status,payment_provider,total")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) {
    await alertFailure("pedido", `Pagamento sem pedido correspondente (ref ${orderId})`, { type, id });
    return { stage: "pedido", status: "error", detail: "pedido não localizado", orderId };
  }

  const mapped = mapMpStatus(payment.status);

  // Só classifica o meio de pagamento (pix/card/boleto) quando APROVADO — assim
  // pedidos rejeitados/pendentes mantêm payment_method='mercadopago' (o retry
  // depende disso) e os aprovados entram nos filtros/métricas do admin.
  // Gravado no MESMO update do status (atômico).
  const approvedMethod =
    mapped.order_action === "paid" ? mpPaymentTypeToMethod(payment.paymentTypeId) : null;

  // Sempre grava o último status observado.
  await supabaseAdmin
    .from("orders")
    .update({
      mp_payment_id: payment.id,
      mp_payment_status: mapped.mp_status,
      mp_payment_method_id: payment.paymentMethodId ?? null,
      mp_status_detail: payment.statusDetail ?? null,
      mp_last_attempt_at: new Date().toISOString(),
      ...(approvedMethod ? { payment_method: approvedMethod } : {}),
    } as never)
    .eq("id", order.id);

  if (mapped.order_action !== "paid" || (order as { status: string }).status === "paid") {
    return { stage: "pedido", status: "ok", detail: `status ${mapped.mp_status}`, orderId: order.id };
  }

  // SEGURANÇA: só confirma se o valor pago bater com o total do pedido. Impede que
  // um pagamento de valor menor (ou de outra cobrança) com o mesmo external_reference
  // marque um pedido caro como pago. Mesma checagem que a conciliação já faz.
  const paidAmount = payment.amount;
  const expectedTotal = Number((order as { total: number | null }).total ?? 0);
  if (paidAmount == null || !(expectedTotal > 0) || Math.abs(paidAmount - expectedTotal) > 0.02) {
    await alertFailure(
      "valor-divergente",
      `Valor pago (${paidAmount}) diferente do total do pedido (${expectedTotal}) — confirmação bloqueada`,
      { type, id, paidAmount, expectedTotal },
      order.id,
    );
    return { stage: "valor", status: "error", detail: "valor divergente", orderId: order.id };
  }

  const { data: result, error: rpcErr } = await supabaseAdmin.rpc("confirm_order_paid" as never, {
    p_order_id: order.id,
    p_mp_payment_id: payment.id,
  } as never);
  if (rpcErr) {
    await alertFailure("confirmar-pagamento", rpcErr.message, { orderId: order.id }, order.id);
    return { stage: "confirmar-pagamento", status: "error", detail: rpcErr.message, orderId: order.id };
  }
  if (result !== "ok" && result !== "already_paid") {
    await alertFailure("confirmar-pagamento", `Retorno "${String(result)}" ao confirmar o pedido`, { orderId: order.id }, order.id);
    return { stage: "confirmar-pagamento", status: "error", detail: String(result), orderId: order.id };
  }

  try {
    const { createDeliveryForOrder } = await import("@/lib/maisentregas.functions");
    await createDeliveryForOrder(order.id);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[mp:webhook] maisentregas error", order.id, detail);
    await alertFailure("entrega-tbt", detail, { orderId: order.id }, order.id);
  }

  return { stage: "pedido", status: "ok", detail: "pagamento confirmado", orderId: order.id };
}
