import { createFileRoute } from "@tanstack/react-router";

// Webhook Cielo (Link de Pagamento / Checkout Cielo).
// A Cielo pode enviar a notificação em 3 formatos e o servidor DEVE sempre
// responder HTTP 200, mesmo em payloads que não reconhecemos — do contrário
// o teste da URL na tela de configuração da Cielo falha.
//
// Formatos aceitos:
//  1) POST application/x-www-form-urlencoded — Cielo Link (Notificação POST)
//     checkout_cielo_order_number, order_number, payment_status, brand, nsu,
//     authorization_code, payment_end_to_end_id, amount, test_transaction
//  2) POST application/json — Cielo Link (Notificação JSON) com
//     { MerchantId, MerchantOrderNumber, Url } (fazemos GET nessa Url)
//  3) POST application/json — API 3.0 e-Commerce (compat.) com
//     { PaymentId, ChangeType }
//
// Cielo NÃO assina o payload. Sempre reconsultamos a fonte oficial antes de
// tratar como pago.

const OK = () => new Response("ok", { status: 200 });

export const Route = createFileRoute("/api/public/cielo/webhook")({
  server: {
    handlers: {
      // Alguns testes da Cielo batem em GET — respondemos 200.
      GET: async () => OK(),
      HEAD: async () => new Response(null, { status: 200 }),
      POST: async ({ request }) => {
        // Nunca deixe uma exceção vazar como 500 — a Cielo interpreta como erro.
        try {
          const contentType = request.headers.get("content-type") ?? "";
          const raw = await request.text().catch(() => "");

          let parsed: Record<string, unknown> = {};

          if (contentType.includes("application/json")) {
            try {
              parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
            } catch {
              parsed = {};
            }
          } else if (
            contentType.includes("application/x-www-form-urlencoded") ||
            contentType.includes("multipart/form-data")
          ) {
            const params = new URLSearchParams(raw);
            for (const [k, v] of params.entries()) parsed[k] = v;
          } else if (raw) {
            // Content-Type desconhecido: tenta JSON, depois form-urlencoded.
            try {
              parsed = JSON.parse(raw) as Record<string, unknown>;
            } catch {
              const params = new URLSearchParams(raw);
              for (const [k, v] of params.entries()) parsed[k] = v;
            }
          }

          // Enfileira processamento assíncrono — a Cielo não espera resposta com dados.
          void processCieloNotification(parsed).catch((err) => {
            console.error("[cielo:webhook] processamento assíncrono falhou", err);
          });

          return OK();
        } catch (err) {
          console.error("[cielo:webhook] handler exception", err);
          // Mesmo em erro interno, responder 200 para o teste da URL passar.
          return OK();
        }
      },
    },
  },
});

async function processCieloNotification(p: Record<string, unknown>): Promise<void> {
  const s = (v: unknown): string => (v == null ? "" : String(v));

  // Formato API 3.0 (compat.): { PaymentId, ChangeType }
  const paymentId = s(p.PaymentId).trim();
  // Formato Link JSON: { MerchantId, MerchantOrderNumber, Url }
  const linkUrl = s(p.Url).trim();
  const merchantOrderNumber = s(p.MerchantOrderNumber).trim();
  // Formato Link POST form-data
  const checkoutOrderNumber = s(p.checkout_cielo_order_number).trim();
  const orderNumber = s(p.order_number).trim();
  void s(p.payment_status); // ignorado: nunca confiar no status do corpo — sempre reconsultamos.

  // Teste de URL / ping: payload vazio → só respondemos 200.
  if (
    !paymentId &&
    !linkUrl &&
    !merchantOrderNumber &&
    !checkoutOrderNumber &&
    !orderNumber
  ) {
    console.info("[cielo:webhook] ping/teste recebido");
    return;
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Registro para auditoria e idempotência (falha silenciosa se duplicado).
  await supabaseAdmin
    .from("cielo_webhook_events")
    .insert({
      payment_id: paymentId || checkoutOrderNumber || merchantOrderNumber || "unknown",
      change_type: Number(p.ChangeType ?? 0),
      raw_payload: p as never,
    } as never)
    .then(() => undefined, () => undefined);

  // === Caso 1 (compat.): { PaymentId } antigo → tratamos como checkout id ===
  if (paymentId && !checkoutOrderNumber && !linkUrl) {
    const { getOrder, mapCieloStatus } = await import("@/lib/cielo.server");
    const cielo = await getOrder(paymentId).catch(() => null);
    if (!cielo?.orderNumber) return;
    const map = mapCieloStatus(cielo.status);
    await applyStatusToOrder(supabaseAdmin, cielo.orderNumber, map.order_action, paymentId, {
      cielo_status: map.cielo_status,
      cielo_tid: cielo.tid ?? null,
      cielo_authorization_code: cielo.authorizationCode ?? null,
      cielo_return_code: cielo.returnCode ?? null,
      cielo_return_message: cielo.returnMessage ?? null,
      cielo_installments: cielo.installments ?? null,
      cielo_payment_method: normalizePaymentType(cielo.paymentType),
    });
    return;
  }


  // === Caso 2: Link de Pagamento (JSON com URL) ===
  // NUNCA confiamos no payload — sempre reconsultamos a Cielo pela ordem oficial.
  if (linkUrl && merchantOrderNumber) {
    const { getOrderByOrderNumber, mapCieloStatus } = await import("@/lib/cielo.server");
    const cielo = await getOrderByOrderNumber(merchantOrderNumber).catch(() => null);
    if (!cielo) {
      console.warn("[cielo:webhook] Case 2: falha ao reconsultar Cielo", merchantOrderNumber);
      return;
    }
    const map = mapCieloStatus(cielo.status);
    await applyStatusToOrder(
      supabaseAdmin,
      merchantOrderNumber,
      map.order_action,
      cielo.checkoutOrderNumber ?? "",
      {
        cielo_status: map.cielo_status,
        cielo_tid: cielo.tid ?? null,
        cielo_authorization_code: cielo.authorizationCode ?? null,
        cielo_return_code: cielo.returnCode ?? null,
        cielo_return_message: cielo.returnMessage ?? null,
        cielo_installments: cielo.installments ?? null,
        cielo_payment_method: normalizePaymentType(cielo.paymentType),
      },
    );
    return;
  }

  // === Caso 3: Link de Pagamento (POST form-data) ===
  // NUNCA confiamos no payment_status do corpo — sempre reconsultamos a Cielo.
  if (orderNumber || checkoutOrderNumber) {
    const { getOrder, getOrderByOrderNumber, mapCieloStatus } = await import("@/lib/cielo.server");
    const localOrderId = orderNumber || checkoutOrderNumber;
    let cielo = null as Awaited<ReturnType<typeof getOrder>>;
    if (checkoutOrderNumber) {
      cielo = await getOrder(checkoutOrderNumber).catch(() => null);
    }
    if (!cielo && localOrderId) {
      cielo = await getOrderByOrderNumber(localOrderId).catch(() => null);
    }
    if (!cielo) {
      console.warn("[cielo:webhook] Case 3: falha ao reconsultar Cielo", { localOrderId, checkoutOrderNumber });
      return;
    }
    const map = mapCieloStatus(cielo.status);
    await applyStatusToOrder(
      supabaseAdmin,
      localOrderId,
      map.order_action,
      cielo.checkoutOrderNumber ?? checkoutOrderNumber,
      {
        cielo_status: map.cielo_status,
        cielo_tid: cielo.tid ?? null,
        cielo_authorization_code: cielo.authorizationCode ?? null,
        cielo_return_code: cielo.returnCode ?? null,
        cielo_return_message: cielo.returnMessage ?? null,
        cielo_installments: cielo.installments ?? null,
        cielo_payment_method: normalizePaymentType(cielo.paymentType),
      },
    );
    return;
  }
}


async function resolveOrderUuid(admin: any, candidate: string): Promise<string | null> {
  const raw = (candidate ?? "").trim();
  if (!raw) return null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) return raw;
  const clean = raw.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  if (clean.length < 8) return null;
  // Busca em pedidos recentes (últimos 7 dias) — o merchant orderNumber da Cielo
  // é o UUID do pedido sem hífens, truncado a 20 chars. Casamos pelo prefixo.
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await admin
    .from("orders")
    .select("id")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(500);
  if (!data?.length) return null;
  const match = (data as Array<{ id: string }>).find(
    (r) => r.id.replace(/-/g, "").toLowerCase().startsWith(clean),
  );
  return match?.id ?? null;
}


async function applyStatusToOrder(
  supabaseAdmin: unknown,
  orderIdOrNumber: string,
  action: "paid" | "cancelled" | "pending" | "noop",
  paymentId: string,
  snapshot: Record<string, unknown>,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = supabaseAdmin as any;
  const orderId = await resolveOrderUuid(admin, orderIdOrNumber);
  if (!orderId) {
    console.warn("[cielo:webhook] order não encontrada localmente", orderIdOrNumber);
    return;
  }
  await admin
    .from("orders")
    .update({
      cielo_payment_id: paymentId || null,
      ...snapshot,
      cielo_last_check_at: new Date().toISOString(),
    })
    .eq("id", orderId);

  const { data: current } = await admin
    .from("orders")
    .select("status")
    .eq("id", orderId)
    .maybeSingle();
  if (!current) {
    console.warn("[cielo:webhook] order não encontrada localmente", orderId);
    return;
  }
  const currentStatus = current.status as string;
  if (currentStatus === "paid" || currentStatus === "cancelled") return;

  if (action === "paid") {
    const { error } = await admin.rpc("confirm_order_paid", {
      p_order_id: orderId,
      p_mp_payment_id: paymentId || orderId,
    });
    if (error) console.error("[cielo:webhook] confirm_order_paid error", error);
    else {
      // Registro de auditoria — confirmação após reconsulta oficial na Cielo.
      await admin
        .from("admin_audit_log")
        .insert({
          user_id: null,
          user_name: "cielo-webhook",
          action: "confirm_order_paid",
          entity: "order",
          entity_id: orderId,
          details: { source: "cielo_webhook", cielo_payment_id: paymentId || null, snapshot },
        })
        .then(() => undefined, () => undefined);
    }
  } else if (action === "cancelled") {
    const { error } = await admin.from("orders").update({ status: "cancelled" }).eq("id", orderId);
    if (error) console.error("[cielo:webhook] cancel update error", error);
  }
}



function normalizePaymentType(t: string | undefined): string | null {
  if (!t) return null;
  const s = t.toLowerCase();
  if (s.includes("credit")) return "credit_card";
  if (s.includes("debit")) return "debit_card";
  if (s.includes("pix")) return "pix";
  if (s.includes("boleto")) return "boleto";
  return s;
}

