import { createFileRoute } from "@tanstack/react-router";

/**
 * Webhook (POST de notificação) da Cielo Checkout.
 *
 * A Cielo envia o `order_number` (nosso ID sem hífens, 20 chars),
 * `checkout_cielo_order_number` e `payment_status`.
 * Regra de ouro: SEMPRE responder 200 para a Cielo não pausar a fila.
 */
export const Route = createFileRoute("/api/public/cielo/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          await handleCieloNotification(request);
        } catch (err) {
          console.error("[cielo:webhook] unexpected", err);
        }
        return new Response("ok", { status: 200 });
      },
      GET: async () => new Response("ok", { status: 200 }),
    },
  },
});

function normalizeKey(id: string): string {
  return id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 20).toLowerCase();
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

async function handleCieloNotification(request: Request): Promise<void> {
  const body = await parseBody(request);
  const orderNumber = body["order_number"] ?? body["ordernumber"] ?? "";
  const checkoutId =
    body["checkout_cielo_order_number"] ?? body["checkoutcieloordernumber"] ?? body["order_id"] ?? "";
  const statusRaw = body["payment_status"] ?? body["status"] ?? "";

  if (!orderNumber && !checkoutId) {
    console.warn("[cielo:webhook] payload sem identificadores", body);
    return;
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { getOrder, getOrderByOrderNumber, mapCieloStatus } = await import("@/lib/cielo.server");

  // Sempre reconsulta a Cielo — nunca confiamos apenas no payload recebido.
  const tx = checkoutId ? await getOrder(checkoutId) : await getOrderByOrderNumber(orderNumber);
  if (!tx) {
    console.warn("[cielo:webhook] transação não encontrada", { orderNumber, checkoutId, statusRaw });
    return;
  }
  const mapped = mapCieloStatus(tx.status);
  const key = normalizeKey(orderNumber || tx.orderNumber || "");

  await supabaseAdmin.from("cielo_webhook_events" as never).insert({
    payment_id: tx.checkoutOrderNumber || checkoutId || key,
    change_type: Number(statusRaw) || 0,
    raw_payload: body as never,
  } as never);

  // 1) Cobrança do Caixa QR (pos_charges)
  const { data: charges } = await supabaseAdmin
    .from("pos_charges")
    .select("id,status,total")
    .in("status", ["pending", "paid"])
    .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    .limit(500);
  const charge = (charges ?? []).find((c) => normalizeKey((c as { id: string }).id) === key) as
    | { id: string; status: string }
    | undefined;
  if (charge) {
    if (mapped.order_action === "paid" && charge.status !== "paid") {
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
    } else {
      await supabaseAdmin
        .from("pos_charges")
        .update({
          mp_status: tx.status,
          mp_status_detail: tx.returnMessage ?? null,
          last_event_at: new Date().toISOString(),
        } as never)
        .eq("id", charge.id);
    }
    return;
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
    console.warn("[cielo:webhook] pedido não localizado", { key, orderNumber });
    return;
  }

  const patch: Record<string, unknown> = {
    cielo_payment_id: tx.checkoutOrderNumber,
    cielo_status: mapped.cielo_status,
    cielo_tid: tx.tid ?? null,
    cielo_authorization_code: tx.authorizationCode ?? null,
    cielo_payment_method: tx.paymentType ?? null,
    cielo_installments: tx.installments ?? null,
    cielo_return_message: tx.returnMessage ?? null,
    cielo_last_check_at: new Date().toISOString(),
  };
  await supabaseAdmin.from("orders").update(patch as never).eq("id", order.id);

  if (mapped.order_action !== "paid" || order.status === "paid") return;

  const { data: result, error: rpcErr } = await supabaseAdmin.rpc("confirm_order_paid" as never, {
    p_order_id: order.id,
    p_mp_payment_id: tx.checkoutOrderNumber,
  } as never);
  if (rpcErr) {
    console.error("[cielo:webhook] confirm error", order.id, rpcErr);
    return;
  }
  if (result === "ok" || result === "already_paid") {
    try {
      const { createDeliveryForOrder } = await import("@/lib/maisentregas.functions");
      await createDeliveryForOrder(order.id);
    } catch (err) {
      console.error("[cielo:webhook] maisentregas error", order.id, err);
    }
  }
}
