// Server-only: cliente HTTP da Asaas (checkout hospedado — Pix, cartão e boleto).
// Docs: https://docs.asaas.com/reference
//
// Autenticação: header `access_token: <ASAAS_API_KEY>`.
// Base URL: ASAAS_API_URL (default https://api.asaas.com/v3).
//
// Este módulo só deve ser importado dentro de handlers de server function /
// server route (o sufixo .server.ts impede que vá para o bundle do cliente).

function baseUrl(): string {
  return (process.env.ASAAS_API_URL || "https://api.asaas.com/v3").replace(/\/+$/, "");
}

function apiKey(): string {
  const key = process.env.ASAAS_API_KEY;
  if (!key) throw new Error("Asaas não configurado");
  return key;
}

async function asaasFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${baseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = new Headers(init?.headers as HeadersInit | undefined);
  headers.set("Content-Type", "application/json");
  headers.set("access_token", apiKey());
  // A Asaas exige User-Agent em todas as requisições.
  headers.set("User-Agent", "Shopbox");
  headers.set("user-agent", "Shopbox");
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers });
  } catch (err) {
    console.error("[asaas] network error", path, err);
    throw new Error("Falha de comunicação com a Asaas");
  }

  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    const errors = (json as { errors?: { description?: string }[] } | null)?.errors;
    const description = errors?.[0]?.description;
    console.error("[asaas] api error", path, res.status, text.slice(0, 500));
    throw new Error(description || "Falha ao processar pagamento na Asaas");
  }

  return json as T;
}

export type AsaasCustomerInput = {
  name: string;
  cpfCnpj: string;
  email?: string | null;
  mobilePhone?: string | null;
};

/** Busca cliente pelo CPF/CNPJ; cria se não existir. Retorna o customerId. */
export async function findOrCreateCustomer(input: AsaasCustomerInput): Promise<string> {
  const cpfCnpj = (input.cpfCnpj ?? "").replace(/\D/g, "");
  if (!cpfCnpj) throw new Error("CPF/CNPJ obrigatório para pagamento");

  const found = await asaasFetch<{ data?: { id: string }[] }>(
    `/customers?cpfCnpj=${encodeURIComponent(cpfCnpj)}&limit=1`,
    { method: "GET" },
  );
  const existing = found?.data?.[0]?.id;
  if (existing) return existing;

  const created = await asaasFetch<{ id: string }>("/customers", {
    method: "POST",
    body: JSON.stringify({
      name: input.name.trim(),
      cpfCnpj,
      email: input.email?.trim() || undefined,
      mobilePhone: (input.mobilePhone ?? "").replace(/\D/g, "") || undefined,
      notificationDisabled: false,
    }),
  });
  if (!created?.id) throw new Error("Falha ao registrar cliente na Asaas");
  // Best-effort: reduzir custo de notificações (só e-mail de pagamento recebido).
  await applyEmailOnlyNotifications(created.id).catch(() => {});
  return created.id;
}

export type AsaasNotification = {
  id: string;
  event: string;
  enabled?: boolean;
  emailEnabledForProvider?: boolean;
  smsEnabledForProvider?: boolean;
  emailEnabledForCustomer?: boolean;
  smsEnabledForCustomer?: boolean;
  phoneCallEnabledForCustomer?: boolean;
  whatsappEnabledForCustomer?: boolean;
};

/** Lista as notificações configuradas de um cliente. */
export async function listCustomerNotifications(customerId: string): Promise<AsaasNotification[]> {
  const res = await asaasFetch<{ data?: AsaasNotification[] }>(
    `/customers/${encodeURIComponent(customerId)}/notifications`,
    { method: "GET" },
  );
  return res?.data ?? [];
}

function desiredNotificationState(event: string) {
  const isReceived = event === "PAYMENT_RECEIVED";
  return {
    enabled: isReceived,
    emailEnabledForProvider: false,
    smsEnabledForProvider: false,
    emailEnabledForCustomer: isReceived,
    smsEnabledForCustomer: false,
    phoneCallEnabledForCustomer: false,
    whatsappEnabledForCustomer: false,
  };
}

function needsUpdate(n: AsaasNotification): boolean {
  const want = desiredNotificationState(n.event);
  return (Object.keys(want) as (keyof typeof want)[]).some((k) => Boolean(n[k]) !== want[k]);
}

/**
 * "Opção B": mantém apenas o e-mail de PAYMENT_RECEIVED para o cliente e
 * desliga todo o resto (SMS, WhatsApp, voz, avisos e notificações do lojista).
 * Idempotente: só chama a API quando há algo divergente.
 * @returns true se enviou atualização, false se já estava correto.
 */
export async function applyEmailOnlyNotifications(customerId: string): Promise<boolean> {
  const notifications = await listCustomerNotifications(customerId);
  const pending = notifications.filter(needsUpdate);
  if (pending.length === 0) return false;

  await asaasFetch("/notifications/batch", {
    method: "PUT",
    body: JSON.stringify({
      customer: customerId,
      notifications: pending.map((n) => ({ id: n.id, ...desiredNotificationState(n.event) })),
    }),
  });
  return true;
}

/** Lista clientes paginado (offset/limit) para ajustes em massa. */
export async function listCustomers(
  offset: number,
  limit = 100,
): Promise<{ ids: string[]; hasMore: boolean }> {
  const res = await asaasFetch<{ data?: { id: string }[]; hasMore?: boolean }>(
    `/customers?offset=${offset}&limit=${limit}`,
    { method: "GET" },
  );
  const ids = (res?.data ?? []).map((c) => c.id).filter(Boolean);
  return { ids, hasMore: Boolean(res?.hasMore) };
}


export type CreatePaymentInput = {
  customerId: string;
  value: number;
  externalReference: string;
  description: string;
  /** yyyy-mm-dd; default = hoje + 1 dia */
  dueDate?: string;
  successUrl?: string;
  /** Nº de parcelas no cartão de crédito (>1 força billingType CREDIT_CARD). */
  installmentCount?: number;
};

export type AsaasPayment = {
  id: string;
  invoiceUrl: string;
  status: string;
};

function tomorrowIso(): string {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

/**
 * Cria a cobrança. Sem parcelamento usa billingType UNDEFINED (cliente escolhe
 * Pix/cartão/boleto). Com `installmentCount > 1` a cobrança é criada como
 * cartão de crédito parcelado (`totalValue` dividido em N parcelas).
 */
export async function createPayment(input: CreatePaymentInput): Promise<AsaasPayment> {
  const installments = Math.max(1, Math.floor(input.installmentCount ?? 1));
  const total = Number(input.value.toFixed(2));
  const body: Record<string, unknown> = {
    customer: input.customerId,
    billingType: installments > 1 ? "CREDIT_CARD" : "UNDEFINED",
    dueDate: input.dueDate ?? tomorrowIso(),
    externalReference: input.externalReference,
    description: input.description.slice(0, 500),
  };
  if (installments > 1) {
    body.installmentCount = installments;
    body.totalValue = total;
  } else {
    body.value = total;
  }
  if (input.successUrl) {
    body.callback = { successUrl: input.successUrl, autoRedirect: true };
  }

  const payment = await asaasFetch<AsaasPayment>("/payments", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!payment?.id || !payment?.invoiceUrl) {
    throw new Error("Asaas não retornou o link de pagamento");
  }
  return { id: payment.id, invoiceUrl: payment.invoiceUrl, status: payment.status };
}


/** Consulta uma cobrança (usado em reconciliação). */
export async function getPayment(id: string): Promise<{
  id: string;
  status: string;
  externalReference?: string | null;
  invoiceUrl?: string | null;
  value?: number;
}> {
  return asaasFetch(`/payments/${encodeURIComponent(id)}`, { method: "GET" });
}

/** Lista cobranças por externalReference (reconciliação sem paymentId salvo). */
export async function listPaymentsByReference(externalReference: string): Promise<
  Array<{ id: string; status: string; value?: number; invoiceUrl?: string | null }>
> {
  const ref = (externalReference ?? "").trim();
  if (!ref) return [];
  const res = await asaasFetch<{ data?: Array<{ id: string; status: string; value?: number; invoiceUrl?: string | null; externalReference?: string | null }> }>(
    `/payments?externalReference=${encodeURIComponent(ref)}&limit=20`,
    { method: "GET" },
  );
  // A API ignora filtros desconhecidos/sem resultado e devolve TODAS as
  // cobranças da conta. Filtramos localmente para nunca casar o pagamento
  // de outro cliente com este pedido.
  return (res?.data ?? []).filter((p) => (p.externalReference ?? "") === ref);
}

/**
 * Lista cobranças geradas por um link de pagamento (venda manual / caixa QR).
 * Links avulsos NÃO carregam externalReference, então esta é a única forma de
 * reconciliar esses pedidos quando o webhook falha.
 */
export async function listPaymentsByPaymentLink(paymentLinkId: string): Promise<
  Array<{ id: string; status: string; value?: number; invoiceUrl?: string | null }>
> {
  const link = (paymentLinkId ?? "").trim();
  if (!link) return [];
  const res = await asaasFetch<{ data?: Array<{ id: string; status: string; value?: number; invoiceUrl?: string | null; paymentLink?: string | null }> }>(
    `/payments?paymentLink=${encodeURIComponent(link)}&limit=100`,
    { method: "GET" },
  );
  // IMPORTANTE: a Asaas IGNORA o filtro `paymentLink` e retorna a conta
  // inteira. Sem este filtro local, um pedido pendente seria confirmado com
  // o pagamento de outro cliente.
  return (res?.data ?? []).filter((p) => (p.paymentLink ?? "") === link);
}


export type PaymentLink = { id: string; url: string };

/**
 * Cria um link de pagamento avulso (sem cliente cadastrado) — usado no caixa
 * (QR code) e na conversão retirada → entrega.
 */
export async function createPaymentLink(input: {
  name: string;
  value: number;
  description?: string;
  billingType?: "UNDEFINED" | "PIX" | "CREDIT_CARD" | "BOLETO";
  maxInstallmentCount?: number;
}): Promise<PaymentLink> {
  const link = await asaasFetch<PaymentLink>("/paymentLinks", {
    method: "POST",
    body: JSON.stringify({
      name: input.name.slice(0, 100),
      description: input.description?.slice(0, 500) || undefined,
      billingType: input.billingType ?? "UNDEFINED",
      chargeType: "DETACHED",
      value: Number(input.value.toFixed(2)),
      dueDateLimitDays: 1,
      notificationEnabled: false,
      ...(input.maxInstallmentCount ? { maxInstallmentCount: input.maxInstallmentCount } : {}),
    }),
  });
  if (!link?.id || !link?.url) throw new Error("Asaas não retornou o link de pagamento");
  return { id: link.id, url: link.url };
}

/** Estorna uma cobrança (total quando `value` é omitido). */
export async function refundPayment(
  paymentId: string,
  value?: number,
  description?: string,
): Promise<{ id: string; status: string }> {
  const body: Record<string, unknown> = {};
  if (value != null) body.value = Number(value.toFixed(2));
  if (description) body.description = description.slice(0, 255);
  const res = await asaasFetch<{ id?: string; status?: string; refunds?: Array<{ id?: string; status?: string }> }>(
    `/payments/${encodeURIComponent(paymentId)}/refund`,
    { method: "POST", body: JSON.stringify(body) },
  );
  const refund = res?.refunds?.[res.refunds.length - 1];
  return { id: String(refund?.id ?? res?.id ?? paymentId), status: String(refund?.status ?? res?.status ?? "REFUNDED") };
}


export type AsaasRefund = {
  status: string;
  value: number;
  dateCreated?: string | null;
  description?: string | null;
  effectiveDate?: string | null;
  transactionReceiptUrl?: string | null;
};

/**
 * Lista os estornos de uma cobrança. A Asaas cria a devolução Pix de forma
 * ASSÍNCRONA (PENDING / AWAITING_*), e ela pode ser CANCELLED depois pelo
 * banco do cliente. Só `DONE` significa dinheiro devolvido de fato.
 */
export async function listPaymentRefunds(paymentId: string): Promise<AsaasRefund[]> {
  const res = await asaasFetch<{ refunds?: AsaasRefund[] }>(
    `/payments/${encodeURIComponent(paymentId)}`,
    { method: "GET" },
  );
  return res?.refunds ?? [];
}

/** Traduz o status do estorno da Asaas para o status interno do refund. */
export function mapRefundStatus(providerStatus: string): "pending" | "confirmed" | "cancelled" {
  const s = (providerStatus || "").toUpperCase();
  if (s === "DONE" || s === "REFUNDED" || s === "CONFIRMED") return "confirmed";
  if (s === "CANCELLED" || s === "CANCELED" || s === "FAILED" || s === "REFUND_CANCELLED") return "cancelled";
  return "pending";
}
