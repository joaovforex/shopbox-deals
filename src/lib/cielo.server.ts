// Server-only: cliente HTTP da Cielo Checkout / Link de Pagamento (produção).
// Documentação: https://docs.cielo.com.br/link/reference/lista-de-recursos
//
// Fluxo:
//  1) OAuth2 client_credentials em POST /api/public/v2/token (Basic <base64>).
//  2) Cria página de pagamento com POST /api/public/v1/orders/  (Bearer).
//  3) Consulta transação por order_number em
//     GET /api/public/v2/merchantOrderNumber/{order_number} → devolve
//     [{ checkoutOrderNumber, createdDate, links: [...] }].
//  4) Consulta detalhes por checkoutOrderNumber em
//     GET /api/public/v2/orders/{checkout_cielo_order_number} → devolve
//     { payment: { status: "Paid" | ..., type, nsu, tid, ... }, ... }
//  5) Cancela em PUT /api/public/v2/orders/{checkout_cielo_order_number}/void
//
// Este módulo só deve ser importado a partir de handlers de server routes /
// server functions.

const CIELO_BASE = "https://cieloecommerce.cielo.com.br";
const TOKEN_URL = `${CIELO_BASE}/api/public/v2/token`;
// Nota: a Cielo devolve 401 quando a URL termina com barra ("/v1/orders/"). Manter sem barra final.
const CHECKOUT_URL = `${CIELO_BASE}/api/public/v1/orders`;
const ORDER_BY_ORDER_NUMBER_URL = `${CIELO_BASE}/api/public/v2/merchantOrderNumber`;
const ORDER_BY_CHECKOUT_ID_URL = `${CIELO_BASE}/api/public/v2/orders`;

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 30_000) return cachedToken.value;

  const clientId = process.env.CIELO_CLIENT_ID;
  const clientSecret = process.env.CIELO_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Cielo não configurada (CIELO_CLIENT_ID / CIELO_CLIENT_SECRET ausentes)");
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[cielo] token error", res.status, text);
    throw new Error("Falha ao autenticar na Cielo");
  }
  const json = (await res.json()) as { access_token: string; expires_in?: number };
  cachedToken = {
    value: json.access_token,
    expiresAt: now + Math.max(60_000, (json.expires_in ?? 1200) * 1000 - 60_000),
  };
  return cachedToken.value;
}

async function authedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Content-Type") && init.body) headers.set("Content-Type", "application/json");
  headers.set("Accept", "application/json");
  const merchantId = process.env.CIELO_MERCHANT_ID;
  if (merchantId) headers.set("MerchantId", merchantId);
  return fetch(url, { ...init, headers });
}

// ============ Criar página de pagamento ============

export type CieloItem = {
  name: string;
  unitPriceCents: number;
  quantity: number;
  sku?: string;
};

export type CieloShippingAddress = {
  street: string;
  number: string;
  complement?: string | null;
  district?: string | null;
  city: string;
  state: string;
  zipCode: string;
};

export type CreateCheckoutInput = {
  orderNumber: string;
  softDescriptor: string;
  items: CieloItem[];
  shipping?:
    | { type: "WithoutShipping" }
    | { type: "FixedAmount"; priceCents: number; address: CieloShippingAddress };
  maxInstallments: number;
  returnUrl: string;
  customer?: {
    name: string;
    email?: string;
    identity?: string; // CPF
    phone?: string;
  };
};

export type CreateCheckoutResult = {
  checkoutUrl: string;
};

/** Extrai um campo da resposta ignorando maiúsculas/minúsculas. */
function pick<T = unknown>(obj: Record<string, unknown> | undefined, ...keys: string[]): T | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const lower: Record<string, unknown> = {};
  for (const k of Object.keys(obj)) lower[k.toLowerCase()] = obj[k];
  for (const k of keys) {
    const v = lower[k.toLowerCase()];
    if (v !== undefined) return v as T;
  }
  return undefined;
}

export async function createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
  // Sanitiza orderNumber para o padrão exigido: só a-zA-Z0-9, máx 20 chars.
  const cleanOrderNumber = input.orderNumber.replace(/[^a-zA-Z0-9]/g, "").slice(0, 20);
  if (cleanOrderNumber.length < 1) throw new Error("orderNumber inválido para Cielo");

  const payload: Record<string, unknown> = {
    OrderNumber: cleanOrderNumber,
    SoftDescriptor: input.softDescriptor.slice(0, 13),
    Cart: {
      Items: input.items.map((it) => ({
        Name: it.name.slice(0, 128),
        UnitPrice: it.unitPriceCents,
        Quantity: it.quantity,
        Type: "Asset",
        Sku: (it.sku ?? cleanOrderNumber).slice(0, 32),
      })),
    },
    Shipping:
      input.shipping?.type === "FixedAmount"
        ? {
            Type: "FixedAmount",
            TargetZipCode: input.shipping.address.zipCode,
            Services: [
              {
                Name: "Entrega",
                Price: input.shipping.priceCents,
                Deadline: 2,
              },
            ],
            Address: {
              Street: input.shipping.address.street,
              Number: input.shipping.address.number,
              Complement: input.shipping.address.complement ?? "",
              District: input.shipping.address.district ?? "",
              City: input.shipping.address.city,
              State: input.shipping.address.state,
            },
          }
        : { Type: "WithoutShipping" },
    Payment: {
      MaxNumberOfInstallments: Math.max(1, Math.min(18, input.maxInstallments)),
    },
    Options: {
      ReturnUrl: input.returnUrl,
    },
  };

  if (input.customer) {
    payload.Customer = {
      FullName: input.customer.name,
      Email: input.customer.email ?? "",
      Identity: input.customer.identity ?? "",
      Phone: input.customer.phone ?? "",
    };
  }

  const res = await authedFetch(CHECKOUT_URL, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[cielo] create checkout error", res.status, text);
    throw new Error(`Falha ao criar checkout na Cielo (${res.status})`);
  }
  const json = (await res.json()) as Record<string, unknown>;

  const settings = pick<Record<string, unknown>>(json, "Settings", "settings");
  const checkoutUrl = pick<string>(settings, "CheckoutUrl", "checkoutUrl");
  if (!checkoutUrl) {
    console.error("[cielo] resposta sem CheckoutUrl", json);
    throw new Error("Resposta inválida da Cielo");
  }
  return { checkoutUrl };
}

// ============ Consultar transações ============

export type CieloOrderStatus = {
  checkoutOrderNumber: string;
  status: string; // "Created" | "Pending" | "Authorized" | "Paid" | "Denied" | "Voided" | "Refunded" | "Cancelled" | "Aborted"
  paymentType?: string; // "creditCard" | "debitCard" | "pix" | "boleto"
  installments?: number;
  tid?: string;
  authorizationCode?: string;
  nsu?: string;
  returnCode?: string;
  returnMessage?: string;
  orderNumber?: string;
  amount?: number; // cents
  brand?: string;
};

/** Lista os checkoutOrderNumbers associados a um order_number (o nosso ID). */
export async function listCheckoutsByOrderNumber(orderNumber: string): Promise<string[]> {
  const clean = orderNumber.replace(/[^a-zA-Z0-9]/g, "").slice(0, 20);
  const res = await authedFetch(`${ORDER_BY_ORDER_NUMBER_URL}/${encodeURIComponent(clean)}`);
  if (res.status === 404) return [];
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[cielo] merchantOrderNumber error", res.status, text);
    return [];
  }
  const json = (await res.json()) as unknown;
  const arr = Array.isArray(json) ? json : [];
  return arr
    .map((it) => pick<string>(it as Record<string, unknown>, "checkoutOrderNumber", "checkout_cielo_order_number"))
    .filter((s): s is string => !!s);
}

/** Diagnóstico: payload bruto da última transação de um order_number. */
export async function getRawOrderByOrderNumber(orderNumber: string): Promise<unknown> {
  const ids = await listCheckoutsByOrderNumber(orderNumber);
  if (ids.length === 0) return { checkouts: [] };
  const last = ids[ids.length - 1] as string;
  const res = await authedFetch(`${ORDER_BY_CHECKOUT_ID_URL}/${encodeURIComponent(last)}`);
  const text = await res.text().catch(() => "");
  return { checkouts: ids, status: res.status, body: text };
}

/** Consulta detalhes de uma transação pelo checkout_cielo_order_number. */
export async function getOrder(checkoutOrderNumber: string): Promise<CieloOrderStatus | null> {
  const res = await authedFetch(
    `${ORDER_BY_CHECKOUT_ID_URL}/${encodeURIComponent(checkoutOrderNumber)}`,
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[cielo] get order error", res.status, text);
    return null;
  }
  const json = (await res.json()) as Record<string, unknown>;
  const payment = pick<Record<string, unknown>>(json, "payment", "Payment");
  const cart = pick<Record<string, unknown>>(json, "cart", "Cart");
  const items = pick<Array<Record<string, unknown>>>(cart, "items", "Items") ?? [];
  const amount = items.reduce((acc, it) => {
    const price = Number(pick<number>(it, "unitPrice", "UnitPrice") ?? 0);
    const qty = Number(pick<number>(it, "quantity", "Quantity") ?? 0);
    return acc + price * qty;
  }, 0);

  return {
    checkoutOrderNumber,
    orderNumber: pick<string>(json, "orderNumber", "OrderNumber"),
    status: String(pick<string>(payment, "status", "Status") ?? "Pending"),
    paymentType: pick<string>(payment, "type", "Type"),
    installments: Number(pick<number>(payment, "numberOfPayments", "NumberOfPayments") ?? 0) || undefined,
    tid: pick<string>(payment, "tid", "Tid"),
    authorizationCode: pick<string>(payment, "authorizationCode", "AuthorizationCode"),
    nsu: pick<string>(payment, "nsu", "Nsu"),
    returnCode: pick<string>(payment, "errorCode", "ErrorCode", "errorcode"),
    returnMessage: pick<string>(payment, "errorMessage", "ErrorMessage", "errormessage"),
    brand: pick<string>(payment, "brand", "Brand"),
    amount: amount || undefined,
  };
}

/** Consulta transação usando o order_number local (busca o checkoutOrderNumber mais recente). */
export async function getOrderByOrderNumber(orderNumber: string): Promise<CieloOrderStatus | null> {
  const ids = await listCheckoutsByOrderNumber(orderNumber);
  if (ids.length === 0) return null;
  // Retorna a última transação (arrays da Cielo vêm em ordem cronológica).
  const last = ids[ids.length - 1];
  return getOrder(last);
}

// ============ Cancelamento ============

export type VoidResult = {
  ok: boolean;
  status: number;
  returnCode?: string;
  returnMessage?: string;
  insufficientBalance?: boolean;
  raw?: string;
};

/**
 * Solicita void/estorno na Cielo.
 * Cielo pode responder 200 com { success: false, returnCode, returnMessage } — tratamos como falha.
 * insufficientBalance = true quando o motivo é "saldo insuficiente para estorno" (D+1).
 */
export async function voidOrder(checkoutOrderNumber: string, amountCents?: number): Promise<VoidResult> {
  const url = `${ORDER_BY_CHECKOUT_ID_URL}/${encodeURIComponent(checkoutOrderNumber)}/void${
    amountCents ? `?amount=${amountCents}` : ""
  }`;
  const res = await authedFetch(url, { method: "PUT" });
  const text = await res.text().catch(() => "");
  let parsed: Record<string, unknown> = {};
  try { parsed = text ? JSON.parse(text) as Record<string, unknown> : {}; } catch { /* ignore */ }

  const returnCode = pick<string>(parsed, "returnCode", "ReturnCode");
  const returnMessage = pick<string>(parsed, "returnMessage", "ReturnMessage");
  const success = pick<boolean>(parsed, "success", "Success");
  const msgLower = String(returnMessage ?? "").toLowerCase();
  const insufficientBalance =
    msgLower.includes("insufficient balance") ||
    msgLower.includes("saldo insuficiente") ||
    returnCode === "7";

  if (!res.ok || success === false) {
    console.error("[cielo] void error", res.status, text);
    return { ok: false, status: res.status, returnCode, returnMessage, insufficientBalance, raw: text };
  }
  return { ok: true, status: res.status, returnCode, returnMessage };
}

// ============ Mapeamento de status ============

/** Traduz o status textual da Cielo Link/Checkout para nossos estados internos. */
export function mapCieloStatus(status: string): {
  cielo_status: string;
  order_action: "paid" | "cancelled" | "pending" | "noop";
} {
  const s = String(status ?? "").trim().toLowerCase();
  switch (s) {
    case "paid":
    case "authorized":
    case "captured":
      return { cielo_status: "paid", order_action: "paid" };
    case "denied":
      return { cielo_status: "denied", order_action: "cancelled" };
    case "voided":
    case "cancelled":
    case "canceled":
    case "aborted":
    case "expired":
      return { cielo_status: "voided", order_action: "cancelled" };
    case "refunded":
      return { cielo_status: "refunded", order_action: "cancelled" };
    case "pending":
    case "created":
    case "scheduled":
      return { cielo_status: "pending", order_action: "pending" };
    // Falha de processamento na Cielo (status 6). Na prática não se recupera:
    // liberamos o pedido para cancelamento/estoque em vez de deixá-lo travado.
    case "notfinalized":
    case "notfinished":
      return { cielo_status: "not_finalized", order_action: "cancelled" };
    default:
      return { cielo_status: `unknown_${s}`, order_action: "noop" };
  }
}
