/**
 * Cliente low-level da API Mais Entregas.
 *
 * Server-only — o sufixo .server.ts impede que entre no bundle do cliente.
 * Toda leitura de env é feita DENTRO das funções (Worker injeta env por request).
 *
 * Endereço de retirada (loja) é hard-coded aqui — a Mais Entregas exige um
 * endereço de origem na criação da corrida.
 */

import process from "node:process";

export const PICKUP_ADDRESS = {
  zip: "83408290",
  street: "Rua Emílio Gleber",
  number: "1118",
  complement: "",
  district: "",
  city: "Colombo",
  state: "pr",
  recipient_name: "Shopbox",
  recipient_phone: "",
};

// Por padrão usamos o domínio oficial. Se a documentação real apontar para
// outro host (ex.: app.maisentregas.com/api), defina o secret MAISENTREGAS_BASE_URL.
function getBaseUrl(): string {
  const url = process.env.MAISENTREGAS_BASE_URL ?? "https://api.maisentregas.com";
  return url.replace(/\/$/, "");
}

function getAppId(): string {
  return process.env.MAISENTREGAS_APP_ID ?? "shopbox";
}

// ---------------- Cache do JWT em memória do Worker ----------------
// Workers são stateless entre requests, mas dentro do mesmo isolate o cache
// reduz drasticamente o número de chamadas /auth.
let cachedToken: { token: string; expiresAt: number } | null = null;

async function fetchWithTimeout(url: string, init: RequestInit, ms = 10_000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

export async function authenticate(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60_000) {
    return cachedToken.token;
  }
  const email = process.env.MAISENTREGAS_EMAIL;
  const apikey = process.env.MAISENTREGAS_APIKEY;
  if (!email || !apikey) throw new Error("Mais Entregas não configurada (faltam secrets MAISENTREGAS_EMAIL/MAISENTREGAS_APIKEY)");

  const res = await fetchWithTimeout(`${getBaseUrl()}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, apikey, app: getAppId() }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Mais Entregas /auth falhou: ${res.status} ${txt.slice(0, 200)}`);
  }
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    token?: string;
    expires_in?: number;
  };
  const token = json.access_token ?? json.token;
  if (!token) throw new Error("Mais Entregas /auth: resposta sem access_token");
  const ttlMs = (json.expires_in ?? 3600) * 1000;
  cachedToken = { token, expiresAt: now + ttlMs };
  return token;
}

async function authedRequest<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const doCall = async () => {
    const token = await authenticate();
    return fetchWithTimeout(`${getBaseUrl()}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  };

  let res = await doCall();
  if (res.status === 401 || res.status === 403) {
    // token expirado/inválido — força refresh e tenta de novo uma vez
    cachedToken = null;
    res = await doCall();
  }
  const text = await res.text();
  let parsed: unknown = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { /* keep null */ }
  if (!res.ok) {
    throw new Error(`Mais Entregas ${method} ${path} falhou: ${res.status} ${text.slice(0, 400)}`);
  }
  return parsed as T;
}

// ---------------- Tipos de domínio ----------------
export type MaisEntregasAddress = {
  zip: string;
  street: string;
  number: string;
  complement?: string;
  district?: string;
  city: string; // "Curitiba"
  state: string; // "pr"
  recipient_name: string;
  recipient_phone: string;
};

export type PreconfirmPayload = {
  city: string; // "pr/curitiba"
  delivery: { type: "immediate" | "scheduled"; date?: string };
  address: Array<{
    zip: string;
    street: string;
    number: string;
    complement?: string;
    district?: string;
    city: string;
    state: string;
  }>;
};

export type PreconfirmResponse = {
  total?: number;
  price?: number;
  value?: number;
  distance?: number;
  estimated_time?: number;
  available?: boolean;
  message?: string;
  [k: string]: unknown;
};

export type ConfirmPayload = PreconfirmPayload & {
  client: {
    name: string;
    document: string;
    phone: string;
    email?: string;
  };
  payment: { modality: "sender" | "receiver"; method: "billed" | "cash" | "card" };
  billing?: { external_reference?: string; observation?: string };
  address: Array<MaisEntregasAddress>;
};

export type ConfirmResponse = {
  id?: string | number;
  order_id?: string | number;
  tracking_url?: string;
  url?: string;
  [k: string]: unknown;
};

export type OrderStatusResponse = {
  id?: string | number;
  ultimo_status_text?: string;
  status?: string;
  tracking_url?: string;
  url?: string;
  [k: string]: unknown;
};

export async function preconfirm(payload: PreconfirmPayload): Promise<PreconfirmResponse> {
  return authedRequest<PreconfirmResponse>("POST", "/order/preconfirm", payload);
}

export async function confirm(payload: ConfirmPayload): Promise<ConfirmResponse> {
  return authedRequest<ConfirmResponse>("POST", "/order/confirm", payload);
}

export async function getOrderStatus(id: string): Promise<OrderStatusResponse> {
  return authedRequest<OrderStatusResponse>("GET", `/order/${encodeURIComponent(id)}`);
}

export async function cancelOrder(id: string, reason?: string): Promise<unknown> {
  return authedRequest<unknown>("POST", `/order/${encodeURIComponent(id)}/cancel`, { reason: reason ?? "" });
}

// ---------------- Helpers de status ----------------
const FINAL_STATUSES = new Set([
  "entregue", "entregue ao destinatario", "delivered",
  "cancelado", "cancelada", "cancelled", "canceled",
  "devolvido", "devolvida", "returned",
]);

export function isFinalStatus(s: string | null | undefined): boolean {
  if (!s) return false;
  return FINAL_STATUSES.has(s.toLowerCase().trim());
}
