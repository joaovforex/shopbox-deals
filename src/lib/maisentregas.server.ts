/**
 * Cliente low-level da API Mais Entregas.
 *
 * Server-only — o sufixo .server.ts impede que entre no bundle do cliente.
 * Toda leitura de env é feita DENTRO das funções (Worker injeta env por request).
 *
 * Endereço de retirada (loja) é hard-coded aqui — a Mais Entregas exige um
 * endereço de origem na criação da corrida.
 *
 * Documentação real (PDF do usuário):
 * - Base URL: https://api.maisentregas.com
 * - X-App-ID: integration (obrigatório em todo endpoint)
 * - Auth: POST /auth { email, apikey } -> { success, access_token, expire (unix timestamp) }
 * - Autenticado via header x-access-token (não Authorization Bearer)
 * - Confirmar: POST /order/confirm
 * - Orçar: POST /order/preconfirm
 * - Status: GET /order/:id
 * - Cancelar: POST /order/:id/cancel
 */

import process from "node:process";

export const PICKUP_ADDRESS = {
  zip: "83408290",
  cep: "83408290",
  street: "Rua Emílio Gleber",
  number: "1118",
  complement: "",
  district: "",
  city: "Colombo",
  state: "PR",
  recipient_name: "Shopbox",
  recipient_phone: "",
};

const DEFAULT_APP_ID = "integration";
const DEFAULT_BASE_URL = "https://api.maisentregas.com";

function getBaseUrl(): string {
  return (process.env.MAISENTREGAS_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, "");
}

function getAppId(): string {
  return process.env.MAISENTREGAS_APP_ID ?? DEFAULT_APP_ID;
}

// ---------------- Cache do token em memória do Worker ----------------
let cachedToken: { token: string; expiresAt: number } | null = null;

async function fetchWithTimeout(url: string, init: RequestInit, ms = 15_000): Promise<Response> {
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
  if (!email || !apikey) {
    throw new Error("Mais Entregas não configurada (faltam secrets MAISENTREGAS_EMAIL/MAISENTREGAS_APIKEY)");
  }

  const res = await fetchWithTimeout(`${getBaseUrl()}/auth`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-App-ID": getAppId(),
    },
    body: JSON.stringify({ email, apikey }),
  });
  const text = await res.text();
  let json: { success?: boolean; access_token?: string; expire?: number; [k: string]: unknown } = {};
  try { json = text ? JSON.parse(text) : {}; } catch { /* ignore */ }
  if (!res.ok) {
    throw new Error(`Mais Entregas /auth falhou: ${res.status} ${text.slice(0, 200)}`);
  }
  const token = json.access_token;
  if (!token) throw new Error("Mais Entregas /auth: resposta sem access_token");
  // expire é unix timestamp (segundos). Se não vier, assume 24h.
  const expiresAt = json.expire ? json.expire * 1000 : now + 24 * 60 * 60 * 1000;
  cachedToken = { token, expiresAt };
  return token;
}

async function authedRequest<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
  contentType: "application/json" | "application/x-www-form-urlencoded" = "application/json",
): Promise<T> {
  const doCall = async () => {
    const token = await authenticate();
    const headers: Record<string, string> = {
      "X-App-ID": getAppId(),
      "x-access-token": token,
    };
    if (contentType) headers["Content-Type"] = contentType;
    return fetchWithTimeout(`${getBaseUrl()}${path}`, {
      method,
      headers,
      body: body !== undefined && body !== null ? JSON.stringify(body) : undefined,
    });
  };

  let res = await doCall();
  if (res.status === 401 || res.status === 403) {
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
  street: string;
  number: string;
  complement?: string;
  district?: string;
  city?: string;
  state?: string;
  cep?: string;
  zip?: string;
  name?: string;
  phone?: string;
  comment?: string;
  latitude?: number;
  longitude?: number;
};

export type PreconfirmPayload = {
  client: string; // email da conta lojista
  city: string; // ex: "pr/curitiba"
  payment: "FATURADO" | "MAQUINA_CARTAO" | "DINHEIRO" | "PIX_LOCAL";
  billing: "ENTREGA" | "COLETA";
  delivery: "IMEDIATO" | "AGENDAMENTO";
  schedule?: string;
  address: MaisEntregasAddress[];
};

export type PreconfirmResponse = {
  success?: boolean;
  id?: number;
  order?: number;
  value?: number;
  estimate?: {
    distancia?: number;
    duracaoEstimadaMinutos?: number;
    horaTermino?: string;
  };
  billing?: { value?: number; delivery?: string };
  [k: string]: unknown;
};

export type ConfirmPayload = PreconfirmPayload & {
  clientData?: {
    company?: { name?: string; cnpj?: string };
    name?: string;
    password?: string;
    phone?: string;
  };
  order?: string;
  document?: string;
  nf?: string;
  deliveryMan?: string;
  awaitingPreparation?: boolean;
  valueDefined?: number;
};

export type ConfirmResponse = {
  success?: boolean;
  id?: number;
  order?: number;
  city?: string;
  client?: { id?: number; name?: string };
  billing?: { type?: string; moment?: string; delivery?: string; value?: number };
  estimate?: { distancia?: number; duracaoEstimadaMinutos?: number; horaTermino?: string };
  address?: Array<MaisEntregasAddress & { id?: number; geo?: [number, number]; postalcode?: string; state?: string }>;
  [k: string]: unknown;
};

export type OrderStatusResponse = {
  id?: number;
  ultimo_status_id?: number;
  ultimo_status_text?: string;
  ultimo_status_datahora?: string;
  concluido?: number;
  motivo_cancelamento?: string | null;
  enderecos?: Array<{
    id?: number;
    nome?: string;
    telefone?: string;
    rua?: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    cidade_id?: number;
    cep?: string;
    latitude?: number;
    longitude?: number;
    comentario?: string;
    position?: number;
    data_chegada?: string | null;
    data_conclusao?: string | null;
  }>;
  motoboy?: { id?: number; nome?: string; picture?: string; latitude?: number; longitude?: number; updated?: number };
  customMessage?: string;
  [k: string]: unknown;
};

export async function preconfirm(payload: PreconfirmPayload): Promise<PreconfirmResponse> {
  return authedRequest<PreconfirmResponse>("POST", "/order/preconfirm", payload);
}

export async function confirm(payload: ConfirmPayload): Promise<ConfirmResponse> {
  return authedRequest<ConfirmResponse>("POST", "/order/confirm", payload);
}

export async function getOrderStatus(id: string): Promise<OrderStatusResponse> {
  // A doc exige Content-Type application/x-www-form-urlencoded mesmo no GET.
  return authedRequest<OrderStatusResponse>("GET", `/order/${encodeURIComponent(id)}`, undefined, "application/x-www-form-urlencoded");
}

export async function cancelOrder(id: string, reason?: string): Promise<{ success?: boolean; message?: string }> {
  return authedRequest<{ success?: boolean; message?: string }>("POST", `/order/${encodeURIComponent(id)}/cancel`, { reason: reason ?? "" });
}

// ---------------- Helpers de status ----------------
const FINAL_STATUSES = new Set([
  "servico_finalizado",
  "serviço finalizado",
  "finalizado",
  "cancelado",
  "cancelada",
  "cancelled",
  "canceled",
]);

export function isFinalStatus(s: string | null | undefined): boolean {
  if (!s) return false;
  return FINAL_STATUSES.has(s.toLowerCase().trim().replace(/_/g, " "));
}

export function isDeliveredStatus(s: string | null | undefined): boolean {
  if (!s) return false;
  const lower = s.toLowerCase().trim().replace(/_/g, " ");
  return lower === "servico finalizado" || lower === "serviço finalizado" || lower === "finalizado";
}

export function statusLabel(s: string | null | undefined): string {
  if (!s) return "Aguardando";
  const map: Record<string, string> = {
    "contatando_parceiro": "Procurando entregador",
    "parceiro_confirmado": "Entregador confirmado",
    "parceiro_a_caminho": "Entregador a caminho",
    "servico_finalizado": "Entregue",
    "pendente": "Pendente",
    "aguardando_preparo": "Aguardando preparo",
  };
  return map[s.toLowerCase().trim().replace(/ /g, "_")] || s.replace(/_/g, " ");
}
