import { createFileRoute } from "@tanstack/react-router";

/**
 * Webhook (POST de notificação) da Cielo Checkout.
 *
 * A Cielo envia o `order_number` (nosso ID sem hífens, 20 chars),
 * `checkout_cielo_order_number` e `payment_status`.
 * Regra de ouro: SEMPRE responder 200 para a Cielo não pausar a fila.
 *
 * Observabilidade: cada notificação é registrada em `cielo_webhook_events`
 * (com o desfecho dentro de `raw_payload._log`) e qualquer falha gera um
 * alerta em `admin_notifications` para acompanhamento em tempo real.
 */
export const Route = createFileRoute("/api/public/cielo/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startedAt = Date.now();
        try {
          const outcome = await handleCieloNotification(request);
          console.info("[cielo:webhook]", JSON.stringify({ ...outcome, ms: Date.now() - startedAt }));
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("[cielo:webhook] unexpected", message, err);
          await alertFailure("exception", message, { ms: Date.now() - startedAt });
        }
        return new Response("ok", { status: 200 });
      },
      GET: async () => new Response("ok", { status: 200 }),
    },
  },
});

type Outcome = {
  stage: string;
  status: "ok" | "ignored" | "error";
  detail?: string;
  orderId?: string;
  key?: string;
};

function normalizeKey(id: string): string {
  return id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 20).toLowerCase();
}

/** Registra o desfecho da notificação para o painel de saúde. */
async function logEvent(params: {
  paymentId: string;
  changeType: number;
  orderId?: string | null;
  cieloStatus?: string | null;
  payload: Record<string, unknown>;
  outcome: Outcome;
}): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("cielo_webhook_events" as never).upsert(
      {
        payment_id: params.paymentId || "desconhecido",
        // change_type é numérico; usamos o timestamp pra permitir múltiplas
        // notificações do mesmo pagamento sem colidir com a unique (payment_id, change_type).
        change_type: Number.isFinite(params.changeType) && params.changeType > 0 ? params.changeType : Date.now() % 2147483647,
        order_id: params.orderId ?? null,
        // A coluna cielo_status é integer; o status textual da Cielo vai no payload.
        cielo_status: null,
        processed_at: new Date().toISOString(),
        raw_payload: { ...params.payload, _log: params.outcome, _cielo_status: params.cieloStatus ?? null } as never,
      } as never,
      { onConflict: "payment_id,change_type" } as never,
    );
    if (error) console.error("[cielo:webhook] falha ao registrar evento", error.message);
  } catch (err) {
    console.error("[cielo:webhook] falha ao registrar evento", err);
  }
}

/** Cria um alerta visível no admin (sino de notificações + painel de saúde). */
async function alertFailure(
  stage: string,
  detail: string,
  metadata: Record<string, unknown> = {},
  orderId?: string | null,
): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("admin_notifications" as never).insert({
      type: "cielo_webhook_error",
      title: "Falha no webhook da Cielo",
      body: `${stage}: ${detail}`.slice(0, 500),
      order_id: orderId ?? null,
      metadata: { stage, detail, ...metadata } as never,
    } as never);
  } catch (err) {
    console.error("[cielo:webhook] falha ao criar alerta", err);
  }
}

async function parseBody(request: Request): Promise<Record<string, string>> {
  const ct = request.headers.get("content-type") ?? "";
  const raw = await request.text();
  const out: Record<string, string> = {};
  if (ct.includes("application/json")) {
    try {
      const json = JSON.parse(raw) as Record<string, unknown>;
      for (const [k, v] of Object.entries(json)) out[k.toLowerCase()] = String(v ?? "");
    } catch {
      /* ignore */
    }
  } else {
    for (const [k, v] of new URLSearchParams(raw)) out[k.toLowerCase()] = v;
  }
  const url = new URL(request.url);
  for (const [k, v] of url.searchParams) if (!out[k.toLowerCase()]) out[k.toLowerCase()] = v;
  return out;
}

async function handleCieloNotification(request: Request): Promise<Outcome> {
  const body = await parseBody(request);
  // A Cielo Checkout envia o nosso identificador em nomes diferentes conforme o evento:
  // `order_number`, `merchantordernumber` ou apenas dentro da `url` de consulta.
  const urlTail = (body["url"] ?? "").split("/").filter(Boolean).pop() ?? "";
  const orderNumber =
    body["order_number"] ??
    body["ordernumber"] ??
    body["merchantordernumber"] ??
    body["merchant_order_number"] ??
    urlTail;
  const checkoutId =
    body["checkout_cielo_order_number"] ?? body["checkoutcieloordernumber"] ?? body["order_id"] ?? "";
  const statusRaw = body["payment_status"] ?? body["status"] ?? "";
  const changeType = Number(statusRaw) || 0;

  if (!orderNumber && !checkoutId) {
    const outcome: Outcome = { stage: "parse", status: "error", detail: "payload sem identificadores" };
    console.error("[cielo:webhook] payload sem identificadores", body);
    await logEvent({ paymentId: "sem-id", changeType, payload: body, outcome });
    await alertFailure("payload", "Notificação recebida sem order_number nem checkout id", { body });
    return outcome;
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { getOrder, getOrderByOrderNumber, mapCieloStatus } = await import("@/lib/cielo.server");

  // Sempre reconsulta a Cielo — nunca confiamos apenas no payload recebido.
  let tx: Awaited<ReturnType<typeof getOrder>> = null;
  try {
    tx = checkoutId ? await getOrder(checkoutId) : await getOrderByOrderNumber(orderNumber);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    const outcome: Outcome = { stage: "consulta-cielo", status: "error", detail };
    console.error("[cielo:webhook] consulta à Cielo falhou", { orderNumber, checkoutId, detail });
    await logEvent({ paymentId: checkoutId || orderNumber, changeType, payload: body, outcome });
    await alertFailure("consulta-cielo", detail, { orderNumber, checkoutId });
    return outcome;
  }

  if (!tx) {
    const outcome: Outcome = { stage: "consulta-cielo", status: "error", detail: "transação não encontrada na Cielo" };
    console.error("[cielo:webhook] transação não encontrada", { orderNumber, checkoutId, statusRaw });
    await logEvent({ paymentId: checkoutId || orderNumber, changeType, payload: body, outcome });
    await alertFailure("consulta-cielo", "Transação não encontrada na Cielo", { orderNumber, checkoutId, statusRaw });
    return outcome;
  }

  const mapped = mapCieloStatus(tx.status);
  const key = normalizeKey(orderNumber || tx.orderNumber || "");
  const paymentId = tx.checkoutOrderNumber || checkoutId || key;

  const finish = async (outcome: Outcome, orderId?: string | null): Promise<Outcome> => {
    await logEvent({
      paymentId,
      changeType,
      orderId: orderId ?? null,
      cieloStatus: mapped.cielo_status,
      payload: body,
      outcome,
    });
    return outcome;
  };

  // 1) Cobrança do Caixa QR (pos_charges)
  const { data: charges } = await supabaseAdmin
    .from("pos_charges")
    .select("id,status,total")
    .in("status", ["pending", "paid"])
    .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    .limit(500);
  const charge = (charges ?? []).find((c) => normalizeKey((c as { id: string }).id) === key) as
    | { id: string; status: string; total: number | null }
    | undefined;
  if (charge) {
    if (mapped.order_action === "paid" && charge.status !== "paid") {
      // SEGURANÇA: confere o valor cobrado (centavos) contra o total da cobrança.
      const paidValue = tx.amount != null ? Number(tx.amount) / 100 : null;
      const expectedTotal = Number(charge.total ?? 0);
      if (paidValue == null || !(expectedTotal > 0) || Math.abs(paidValue - expectedTotal) > 0.02) {
        console.warn("[cielo:webhook] caixa-qr valor divergente", { chargeId: charge.id, paidValue, expectedTotal });
        await alertFailure(
          "valor-divergente",
          `Caixa QR: valor pago (${paidValue}) diferente do total (${expectedTotal}) — bloqueado`,
          { chargeId: charge.id, paidValue, expectedTotal },
        );
        return finish({ stage: "caixa-qr", status: "error", detail: "valor divergente", key });
      }
      await supabaseAdmin
        .from("pos_charges")
        .update({
          status: "paid",
          mp_payment_id: tx.checkoutOrderNumber,
          mp_status: tx.status,
          mp_payment_method_id: tx.paymentType ?? null,
          paid_at: new Date().toISOString(),
          last_event_at: new Date().toISOString(),
        } as never)
        .eq("id", charge.id);
      return finish({ stage: "caixa-qr", status: "ok", detail: "cobrança paga", key });
    }
    await supabaseAdmin
      .from("pos_charges")
      .update({
        mp_status: tx.status,
        mp_status_detail: tx.returnMessage ?? null,
        last_event_at: new Date().toISOString(),
      } as never)
      .eq("id", charge.id);
    return finish({ stage: "caixa-qr", status: "ok", detail: `status ${mapped.cielo_status}`, key });
  }

  // 2) Pedido da loja / venda manual
  const { data: orders } = await supabaseAdmin
    .from("orders")
    .select("id,status,total,delivery_fee")
    .eq("payment_provider", "cielo")
    .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    .limit(500);
  const order = (orders ?? []).find((o) => normalizeKey((o as { id: string }).id) === key) as
    | { id: string; status: string; total: number | null; delivery_fee: number | null }
    | undefined;
  if (!order) {
    const outcome: Outcome = { stage: "pedido", status: "error", detail: "pedido não localizado no banco", key };
    console.error("[cielo:webhook] pedido não localizado", { key, orderNumber, paymentId });
    await logEvent({ paymentId, changeType, cieloStatus: mapped.cielo_status, payload: body, outcome });
    await alertFailure("pedido", `Pagamento recebido sem pedido correspondente (ref ${key})`, {
      key,
      orderNumber,
      paymentId,
      cieloStatus: mapped.cielo_status,
    });
    return outcome;
  }

  const patch: Record<string, unknown> = {
    cielo_payment_id: tx.checkoutOrderNumber,
    cielo_status: mapped.cielo_status,
    cielo_tid: tx.tid ?? null,
    cielo_authorization_code: tx.authorizationCode ?? null,
    cielo_payment_method: tx.paymentType ?? null,
    cielo_card_brand: tx.brand ?? null,
    cielo_installments: tx.installments ?? null,
    cielo_return_code: tx.returnCode ?? null,
    cielo_return_message: tx.returnMessage ?? null,
    cielo_last_check_at: new Date().toISOString(),
  };
  const { error: patchErr } = await supabaseAdmin.from("orders").update(patch as never).eq("id", order.id);
  if (patchErr) {
    console.error("[cielo:webhook] falha ao atualizar pedido", order.id, patchErr.message);
    await alertFailure("atualizar-pedido", patchErr.message, { orderId: order.id }, order.id);
  }

  if (mapped.order_action !== "paid" || order.status === "paid") {
    return finish(
      { stage: "pedido", status: "ok", detail: `status ${mapped.cielo_status}`, orderId: order.id, key },
      order.id,
    );
  }

  // SEGURANÇA: confere o valor cobrado (centavos, sem frete) contra o total do
  // pedido antes de confirmar. Mesma checagem da conciliação — evita marcar um
  // pedido caro como pago com uma cobrança de valor menor.
  const paidValue = tx.amount != null ? Number(tx.amount) / 100 : null;
  const expectedTotal = Math.max(0, Number(order.total ?? 0) - Number(order.delivery_fee ?? 0));
  if (paidValue == null || !(expectedTotal > 0) || Math.abs(paidValue - expectedTotal) > 0.02) {
    const outcome: Outcome = { stage: "valor", status: "error", detail: "valor divergente", orderId: order.id, key };
    console.warn("[cielo:webhook] valor divergente", { orderId: order.id, paidValue, expectedTotal });
    await logEvent({ paymentId, changeType, orderId: order.id, cieloStatus: mapped.cielo_status, payload: body, outcome });
    await alertFailure(
      "valor-divergente",
      `Valor pago (${paidValue}) diferente do esperado (${expectedTotal}) — confirmação bloqueada`,
      { orderId: order.id, paidValue, expectedTotal },
      order.id,
    );
    return outcome;
  }

  const { data: result, error: rpcErr } = await supabaseAdmin.rpc("confirm_order_paid" as never, {
    p_order_id: order.id,
    p_mp_payment_id: tx.checkoutOrderNumber,
  } as never);
  if (rpcErr) {
    const outcome: Outcome = { stage: "confirmar-pagamento", status: "error", detail: rpcErr.message, orderId: order.id, key };
    console.error("[cielo:webhook] confirm error", order.id, rpcErr);
    await logEvent({ paymentId, changeType, orderId: order.id, cieloStatus: mapped.cielo_status, payload: body, outcome });
    await alertFailure("confirmar-pagamento", rpcErr.message, { orderId: order.id }, order.id);
    return outcome;
  }
  if (result !== "ok" && result !== "already_paid") {
    const outcome: Outcome = { stage: "confirmar-pagamento", status: "error", detail: String(result), orderId: order.id, key };
    console.error("[cielo:webhook] confirm inesperado", order.id, result);
    await logEvent({ paymentId, changeType, orderId: order.id, cieloStatus: mapped.cielo_status, payload: body, outcome });
    await alertFailure("confirmar-pagamento", `Retorno "${String(result)}" ao confirmar o pedido`, { orderId: order.id }, order.id);
    return outcome;
  }

  try {
    const { createDeliveryForOrder } = await import("@/lib/maisentregas.functions");
    await createDeliveryForOrder(order.id);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[cielo:webhook] maisentregas error", order.id, detail);
    await alertFailure("entrega-tbt", detail, { orderId: order.id }, order.id);
  }

  return finish({ stage: "pedido", status: "ok", detail: "pagamento confirmado", orderId: order.id, key }, order.id);
}
