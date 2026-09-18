// Server-only: cliente HTTP do Mercado Pago (Checkout Pro, produção).
// Documentação: https://www.mercadopago.com.br/developers/pt/reference
//
// Fluxo:
//  1) Criar preferência: POST /checkout/preferences (Bearer <MP_ACCESS_TOKEN>)
//     → devolve { id, init_point } (URL para onde o cliente é redirecionado).
//  2) Confirmar pagamento: o Mercado Pago chama nosso webhook com o id do
//     pagamento; consultamos GET /v1/payments/{id} → { status, external_reference, ... }.
//  3) Conciliação: GET /v1/payments/search?external_reference={orderId}.
//
// external_reference = o UUID do nosso pedido — é assim que casamos o pagamento
// de volta com o pedido, sem depender de "adivinhar" referência.
//
// Este módulo só deve ser importado a partir de handlers de server routes /
// server functions.

const MP_BASE = "https://api.mercadopago.com";

function accessToken(): string {
  const tok = process.env.MP_ACCESS_TOKEN;
  if (!tok) throw new Error("Mercado Pago não configurado (MP_ACCESS_TOKEN ausente)");
  return tok;
}

async function mpFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${accessToken()}`);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return fetch(`${MP_BASE}${path}`, { ...init, headers });
}

// ============ Criar preferência (Checkout Pro) ============

export type MpItem = { title: string; quantity: number; unitPrice: number };

export type CreatePreferenceInput = {
  orderId: string;
  items: MpItem[];
  payer: { name?: string; email?: string };
  returnUrl: string; // sucesso/retorno
  notificationUrl: string; // webhook
  maxInstallments: number;
  statementDescriptor?: string;
};

export type CreatePreferenceResult = { preferenceId: string; initPoint: string };

export async function createPreference(input: CreatePreferenceInput): Promise<CreatePreferenceResult> {
  const body = {
    items: input.items.map((it, idx) => ({
      id: `${input.orderId}-${idx}`,
      title: it.title.slice(0, 250),
      quantity: it.quantity,
      unit_price: Number(Number(it.unitPrice).toFixed(2)),
      currency_id: "BRL",
    })),
    payer: {
      name: input.payer.name || undefined,
      email: input.payer.email || undefined,
    },
    external_reference: input.orderId,
    back_urls: {
      success: input.returnUrl,
      pending: input.returnUrl,
      failure: input.returnUrl,
    },
    auto_return: "approved",
    notification_url: input.notificationUrl,
    statement_descriptor: (input.statementDescriptor ?? "SHOPBOX").slice(0, 13),
    payment_methods: {
      installments: Math.max(1, Math.min(18, input.maxInstallments)),
    },
  };

  const res = await mpFetch("/checkout/preferences", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[mp] create preference error", res.status, text);
    throw new Error(`Falha ao criar pagamento no Mercado Pago (${res.status})`);
  }
  const json = (await res.json()) as { id?: string; init_point?: string; sandbox_init_point?: string };
  const initPoint = json.init_point || json.sandbox_init_point;
  if (!json.id || !initPoint) {
    console.error("[mp] resposta sem init_point", json);
    throw new Error("Resposta inválida do Mercado Pago");
  }
  return { preferenceId: String(json.id), initPoint };
}

// ============ Consultar pagamento ============

export type MpPayment = {
  id: string;
  status: string; // approved | pending | in_process | rejected | cancelled | refunded | charged_back
  statusDetail?: string;
  externalReference?: string;
  amount?: number; // reais
  paymentMethodId?: string; // 'pix' | 'visa' | 'master' | 'bolbradesco' | ...
  paymentTypeId?: string; // 'credit_card' | 'debit_card' | 'account_money' | 'ticket' | 'bank_transfer' (pix)
  installments?: number;
};

function num(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export async function getPayment(id: string): Promise<MpPayment | null> {
  const res = await mpFetch(`/v1/payments/${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[mp] get payment error", res.status, text);
    return null;
  }
  const j = (await res.json()) as Record<string, unknown>;
  return {
    id: String(j.id ?? id),
    status: String(j.status ?? "pending"),
    statusDetail: j.status_detail != null ? String(j.status_detail) : undefined,
    externalReference: j.external_reference != null ? String(j.external_reference) : undefined,
    amount: num(j.transaction_amount),
    paymentMethodId: j.payment_method_id != null ? String(j.payment_method_id) : undefined,
    paymentTypeId: j.payment_type_id != null ? String(j.payment_type_id) : undefined,
    installments: num(j.installments),
  };
}

/** Consulta a merchant_order (o webhook às vezes chega como topic=merchant_order). */
export async function getMerchantOrder(
  id: string,
): Promise<{ externalReference?: string; payments: Array<{ id: string; status: string }> } | null> {
  const res = await mpFetch(`/merchant_orders/${encodeURIComponent(id)}`);
  if (!res.ok) {
    if (res.status !== 404) {
      const text = await res.text().catch(() => "");
      console.error("[mp] get merchant_order error", res.status, text);
    }
    return null;
  }
  const j = (await res.json()) as Record<string, unknown>;
  const rawPayments = Array.isArray(j.payments) ? (j.payments as Array<Record<string, unknown>>) : [];
  return {
    externalReference: j.external_reference != null ? String(j.external_reference) : undefined,
    payments: rawPayments.map((p) => ({ id: String(p.id ?? ""), status: String(p.status ?? "") })),
  };
}

/** Busca pagamentos de um pedido pelo external_reference (usado na conciliação). */
export async function searchPaymentsByExternalReference(orderId: string): Promise<MpPayment[]> {
  const res = await mpFetch(`/v1/payments/search?external_reference=${encodeURIComponent(orderId)}&sort=date_created&criteria=desc`);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[mp] search payments error", res.status, text);
    return [];
  }
  const j = (await res.json()) as { results?: Array<Record<string, unknown>> };
  const results = Array.isArray(j.results) ? j.results : [];
  return results.map((p) => ({
    id: String(p.id ?? ""),
    status: String(p.status ?? "pending"),
    statusDetail: p.status_detail != null ? String(p.status_detail) : undefined,
    externalReference: p.external_reference != null ? String(p.external_reference) : undefined,
    amount: num(p.transaction_amount),
    paymentMethodId: p.payment_method_id != null ? String(p.payment_method_id) : undefined,
    paymentTypeId: p.payment_type_id != null ? String(p.payment_type_id) : undefined,
    installments: num(p.installments),
  }));
}

// ============ Estorno / devolução ============

export type MpRefundResult = { id: string; status: string; amount?: number };

/**
 * Estorna (devolve) um pagamento no Mercado Pago.
 * POST /v1/payments/{id}/refunds — sem `amount` = total; com `amount` = parcial.
 * Pix e cartão são suportados; a devolução costuma nascer `approved`.
 * Idempotência: usamos X-Idempotency-Key pra não duplicar se a chamada repetir.
 */
export async function refundPayment(paymentId: string, amountReais?: number): Promise<MpRefundResult> {
  const isPartial = amountReais != null && Number.isFinite(amountReais) && amountReais > 0;
  const body = isPartial ? JSON.stringify({ amount: Number(Number(amountReais).toFixed(2)) }) : "{}";
  const idem = `refund-${paymentId}-${isPartial ? Number(amountReais).toFixed(2) : "full"}`;
  const res = await mpFetch(`/v1/payments/${encodeURIComponent(paymentId)}/refunds`, {
    method: "POST",
    headers: { "X-Idempotency-Key": idem },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[mp] refund error", res.status, text);
    // Mensagem do MP costuma vir em { message, error, cause: [...] }
    let detail = `HTTP ${res.status}`;
    try {
      const j = JSON.parse(text) as { message?: string; error?: string };
      detail = j.message || j.error || detail;
    } catch {
      /* keep default */
    }
    throw new Error(detail);
  }
  const j = (await res.json()) as Record<string, unknown>;
  return {
    id: j.id != null ? String(j.id) : "",
    status: String(j.status ?? "approved"),
    amount: num(j.amount),
  };
}

/**
 * Traduz o tipo de pagamento do MP para o `payment_method` interno da loja
 * ('pix' | 'card' | 'boleto'), usado pelos filtros e métricas do admin.
 * Retorna null quando não dá pra classificar (mantém o valor atual).
 */
export function mpPaymentTypeToMethod(paymentTypeId?: string | null): "pix" | "card" | "boleto" | null {
  const t = String(paymentTypeId ?? "").trim().toLowerCase();
  if (t === "credit_card" || t === "debit_card" || t === "prepaid_card") return "card";
  if (t === "bank_transfer" || t === "account_money") return "pix";
  if (t === "ticket" || t === "atm") return "boleto";
  return null;
}

// ============ Mapeamento de status ============

/** Traduz o status do Mercado Pago para nossos estados internos. */
export function mapMpStatus(status: string): {
  mp_status: string;
  order_action: "paid" | "cancelled" | "pending" | "noop";
} {
  const s = String(status ?? "").trim().toLowerCase();
  switch (s) {
    case "approved":
    case "authorized":
      return { mp_status: "approved", order_action: "paid" };
    case "pending":
    case "in_process":
    case "in_mediation":
      return { mp_status: s, order_action: "pending" };
    case "rejected":
    case "cancelled":
    case "canceled":
      return { mp_status: s, order_action: "cancelled" };
    case "refunded":
    case "charged_back":
      return { mp_status: s, order_action: "cancelled" };
    default:
      return { mp_status: `unknown_${s}`, order_action: "noop" };
  }
}
