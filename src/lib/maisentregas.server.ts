/**
 * Cliente low-level da API Mais Entregas.
 *
 * Server-only — o sufixo .server.ts impede que entre no bundle do cliente.
 * Toda leitura de env é feita DENTRO das funções (Worker injeta env por request).
 *
 * Endereço de retirada (loja): lido de `site_settings` (pickup_*), editável em
 * /admin/configuracoes. O valor abaixo é só o fallback quando a tabela ainda
 * não tem os campos preenchidos.
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

export type PickupAddress = {
  zip: string;
  cep: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
  recipient_name: string;
  recipient_phone: string;
};

export const PICKUP_ADDRESS: PickupAddress = {
  zip: "83408290",
  cep: "83408290",
  street: "Rua Emílio Gleber",
  number: "1118",
  complement: "",
  district: "Atuba",
  city: "Colombo",
  state: "PR",
  recipient_name: "Shopbox",
  recipient_phone: "",
};

// Cache curto do endereço de coleta (evita 1 SELECT por cotação).
let cachedPickup: { value: PickupAddress; at: number } | null = null;
const PICKUP_CACHE_MS = 60_000;

/**
 * Endereço/telefone de coleta usados em TODA corrida (cotação e criação).
 * Lê `site_settings.pickup_*`; cada campo vazio cai no fallback acima.
 */
export async function getPickupAddress(): Promise<PickupAddress> {
  const now = Date.now();
  if (cachedPickup && now - cachedPickup.at < PICKUP_CACHE_MS) return cachedPickup.value;
  let value: PickupAddress = { ...PICKUP_ADDRESS };
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("site_settings")
      .select("pickup_zip, pickup_street, pickup_number, pickup_complement, pickup_district, pickup_city, pickup_state, pickup_phone, pickup_name")
      .eq("id", 1)
      .maybeSingle();
    const d = (data ?? {}) as Record<string, string | null | undefined>;
    const pick = (k: string, fallback: string) => (d[k] ?? "").toString().trim() || fallback;
    const zip = pick("pickup_zip", PICKUP_ADDRESS.zip).replace(/\D/g, "") || PICKUP_ADDRESS.zip;
    value = {
      zip,
      cep: zip,
      street: pick("pickup_street", PICKUP_ADDRESS.street),
      number: pick("pickup_number", PICKUP_ADDRESS.number),
      complement: pick("pickup_complement", PICKUP_ADDRESS.complement),
      district: pick("pickup_district", PICKUP_ADDRESS.district),
      city: pick("pickup_city", PICKUP_ADDRESS.city),
      state: pick("pickup_state", PICKUP_ADDRESS.state).toUpperCase(),
      recipient_name: pick("pickup_name", PICKUP_ADDRESS.recipient_name),
      recipient_phone: pick("pickup_phone", PICKUP_ADDRESS.recipient_phone).replace(/\D/g, ""),
    };
  } catch (err) {
    console.warn("[maisentregas] getPickupAddress: usando fallback", err instanceof Error ? err.message : err);
  }
  cachedPickup = { value, at: now };
  return value;
}

// ---------------- Entrega de CARRO (Fiorino) ----------------
export type CarDeliveryConfig = {
  enabled: boolean;
  /** Código do serviço/cidade de carro na TBT. Vazio = sem automação pela API. */
  meCity: string | null;
  /** Campos extras mesclados no payload das corridas de carro. */
  meExtra: Record<string, unknown> | null;
  feeTable: Record<string, number>;
  feeDefault: number | null;
};

let cachedCarCfg: { value: CarDeliveryConfig; at: number } | null = null;

export async function getCarDeliveryConfig(): Promise<CarDeliveryConfig> {
  const now = Date.now();
  if (cachedCarCfg && now - cachedCarCfg.at < PICKUP_CACHE_MS) return cachedCarCfg.value;
  const { parseCarFeeTable } = await import("@/lib/delivery-vehicle");
  let value: CarDeliveryConfig = { enabled: true, meCity: null, meExtra: null, feeTable: {}, feeDefault: null };
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("site_settings")
      .select("car_delivery_enabled, car_me_city, car_me_extra, car_fee_table, car_fee_default")
      .eq("id", 1)
      .maybeSingle();
    const d = (data ?? {}) as Record<string, unknown>;
    const extra = d.car_me_extra;
    const def = Number(d.car_fee_default);
    value = {
      enabled: d.car_delivery_enabled !== false,
      meCity: String(d.car_me_city ?? "").trim() || null,
      meExtra: extra && typeof extra === "object" && !Array.isArray(extra) ? (extra as Record<string, unknown>) : null,
      feeTable: parseCarFeeTable(d.car_fee_table),
      feeDefault: Number.isFinite(def) && def > 0 ? def : null,
    };
  } catch (err) {
    console.warn("[maisentregas] getCarDeliveryConfig: usando padrão", err instanceof Error ? err.message : err);
  }
  cachedCarCfg = { value, at: now };
  return value;
}

/**
 * Erro de credencial GLOBAL (nosso e-mail/apikey recusados no /auth).
 * Não é um problema do pedido — nunca deve marcar a corrida como
 * "[sem-acesso]" (foi isso que travou 120 corridas em 01/09).
 */
export class MaisEntregasAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MaisEntregasAuthError";
  }
}

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
    throw new MaisEntregasAuthError(`Mais Entregas /auth falhou: ${res.status} ${text.slice(0, 200)}`);
  }
  const token = json.access_token;
  if (!token) throw new MaisEntregasAuthError("Mais Entregas /auth: resposta sem access_token");
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
  order?: string;
  pedido?: string;

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
  estimate?: { distancia?: number; duracaoEstimadaMinutos?: number; horaTermino?: string };
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
// A lógica vive em `maisentregas-status.ts` (client-safe) — aqui só
// mantemos os nomes antigos para quem já importava deste módulo.
export {
  normalizeMeStatus,
  isMeDelivered as isDeliveredStatus,
  isMeFinal as isFinalStatus,
  meStatusLabel as statusLabel,
} from "@/lib/maisentregas-status";

/**
 * Extrai da resposta de status o que interessa gravar no pedido.
 * O último endereço da lista é o ponto de ENTREGA (o primeiro é a coleta).
 */
export function extractStatusDetails(res: OrderStatusResponse): {
  rawStatus: string | null;
  arrivedAt: string | null;
  concludedAt: string | null;
  cancelReason: string | null;
} {
  const rawStatus = (res.ultimo_status_text ?? "").toString().trim() || null;
  const enderecos = Array.isArray(res.enderecos) ? res.enderecos : [];
  const dest = enderecos.length ? enderecos[enderecos.length - 1] : undefined;
  const toIso = (v: string | null | undefined): string | null => {
    if (!v) return null;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) {
      // Formato brasileiro "dd/mm/aaaa hh:mm(:ss)"
      const m = /^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(v);
      if (!m) return null;
      const d2 = new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6] ?? "00"}-03:00`);
      return Number.isNaN(d2.getTime()) ? null : d2.toISOString();
    }
    return d.toISOString();
  };
  return {
    rawStatus,
    arrivedAt: toIso(dest?.data_chegada ?? null),
    concludedAt: toIso(dest?.data_conclusao ?? null),
    cancelReason: (res.motivo_cancelamento ?? "").toString().trim() || null,
  };
}
