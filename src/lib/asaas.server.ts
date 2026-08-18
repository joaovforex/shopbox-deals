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
  /** Endereço (opcional) — melhora a análise de risco de cartão. */
  postalCode?: string | null;
  address?: string | null;
  addressNumber?: string | null;
  complement?: string | null;
  province?: string | null;
  city?: string | null;
  state?: string | null;
};

function customerPayload(input: AsaasCustomerInput, cpfCnpj: string) {
  const zip = (input.postalCode ?? "").replace(/\D/g, "");
  return {
    name: input.name.trim(),
    cpfCnpj,
    email: input.email?.trim() || undefined,
    mobilePhone: (input.mobilePhone ?? "").replace(/\D/g, "") || undefined,
    postalCode: zip.length === 8 ? zip : undefined,
    address: input.address?.trim() || undefined,
    addressNumber: input.addressNumber ? String(input.addressNumber).trim() || undefined : undefined,
    complement: input.complement?.trim() || undefined,
    province: input.province?.trim() || undefined,
    city: input.city?.trim() || undefined,
    state: (input.state ?? "").trim().toUpperCase() || undefined,
    notificationDisabled: false,
  };
}

/** Busca cliente pelo CPF/CNPJ; cria se não existir. Retorna o customerId. */
export async function findOrCreateCustomer(input: AsaasCustomerInput): Promise<string> {
  const cpfCnpj = (input.cpfCnpj ?? "").replace(/\D/g, "");
  if (!cpfCnpj) throw new Error("CPF/CNPJ obrigatório para pagamento");

  const payload = customerPayload(input, cpfCnpj);

  const found = await asaasFetch<{ data?: { id: string }[] }>(
    `/customers?cpfCnpj=${encodeURIComponent(cpfCnpj)}&limit=1`,
    { method: "GET" },
  );
  const existing = found?.data?.[0]?.id;
  if (existing) {
    // Best-effort: mantém telefone/endereço atualizados para a análise de risco.
    await asaasFetch(`/customers/${encodeURIComponent(existing)}`, {
      method: "POST",
      body: JSON.stringify(payload),
    }).catch(() => {});
    return existing;
  }

  const created = await asaasFetch<{ id: string }>("/customers", {
    method: "POST",
    body: JSON.stringify(payload),
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
 * Cria SEMPRE uma cobrança única com billingType UNDEFINED: o cliente escolhe
 * Pix/cartão/boleto — e o número de parcelas no cartão — na própria página
 * hospedada da Asaas. Nunca pré-dividimos em carnê.
 */
export async function createPayment(input: CreatePaymentInput): Promise<AsaasPayment> {
  const total = Number(input.value.toFixed(2));
  const body: Record<string, unknown> = {
    customer: input.customerId,
    billingType: "UNDEFINED",
    dueDate: input.dueDate ?? tomorrowIso(),
    externalReference: input.externalReference,
    description: input.description.slice(0, 500),
    value: total,
  };
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

/* ============================================================
 * ASAAS CHECKOUT (POST /v3/checkouts)
 *
 * Página hospedada da Asaas com controle do parcelamento
 * (installment.maxInstallmentCount). Continua sendo redirecionamento:
 * nenhum dado de cartão passa pelo nosso site.
 * ============================================================ */

export type AsaasCheckoutInput = {
  /** Valor TOTAL a cobrar (já com frete e menos cashback). */
  value: number;
  /** id do pedido — essencial para webhook/reconciliação. */
  externalReference: string;
  /** Nome do item resumo exibido no checkout. */
  itemName: string;
  maxInstallmentCount?: number;
  minutesToExpire?: number;
  successUrl: string;
  cancelUrl: string;
  expiredUrl: string;
  customer: {
    name: string;
    cpfCnpj: string;
    email?: string | null;
    phone?: string | null;
    postalCode?: string | null;
    address?: string | null;
    addressNumber?: string | null;
    province?: string | null;
  };
};

export type AsaasCheckoutResult = { id: string; url: string };

/** Endereço padrão da loja: a Asaas exige endereço no customerData. */
const CHECKOUT_FALLBACK_ADDRESS = {
  postalCode: "13480000",
  address: "Rua Comercial",
  addressNumber: "S/N",
  province: "Centro",
};

function digits(v: unknown): string {
  return String(v ?? "").replace(/\D/g, "");
}

function checkoutCustomerData(c: AsaasCheckoutInput["customer"], withPhone: boolean) {
  const zip = digits(c.postalCode);
  const phone = digits(c.phone);
  return {
    name: c.name.trim().slice(0, 100),
    cpfCnpj: digits(c.cpfCnpj),
    email: c.email?.trim() || undefined,
    // A Asaas valida o telefone; quando inválido reenviamos sem ele.
    phone: withPhone && phone.length >= 10 ? phone : undefined,
    postalCode: zip.length === 8 ? zip : CHECKOUT_FALLBACK_ADDRESS.postalCode,
    address: c.address?.trim() || CHECKOUT_FALLBACK_ADDRESS.address,
    addressNumber: String(c.addressNumber ?? "").trim() || CHECKOUT_FALLBACK_ADDRESS.addressNumber,
    province: c.province?.trim() || CHECKOUT_FALLBACK_ADDRESS.province,
    // NÃO enviar `city`: a Asaas espera código IBGE numérico.
  };
}

/**
 * Cria uma sessão de checkout hospedada com Pix + cartão e teto de parcelas.
 * A resposta traz `id` e `link` (URL do checkout).
 */
export async function createAsaasCheckout(input: AsaasCheckoutInput): Promise<AsaasCheckoutResult> {
  const total = Number(input.value.toFixed(2));
  const build = (withPhone: boolean) => ({
    billingTypes: ["PIX", "CREDIT_CARD"],
    chargeTypes: ["DETACHED", "INSTALLMENT"],
    minutesToExpire: input.minutesToExpire ?? 60,
    callback: {
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
      expiredUrl: input.expiredUrl,
    },
    items: [{ name: input.itemName.slice(0, 100), value: total, quantity: 1 }],
    installment: { maxInstallmentCount: input.maxInstallmentCount ?? 5 },
    externalReference: input.externalReference,
    customerData: checkoutCustomerData(input.customer, withPhone),
  });

  type CheckoutResponse = { id?: string; link?: string; status?: string };
  let res: CheckoutResponse;
  try {
    res = await asaasFetch<CheckoutResponse>("/checkouts", {
      method: "POST",
      body: JSON.stringify(build(true)),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (/phone/i.test(msg)) {
      // Telefone recusado pela Asaas: recria sem o telefone.
      res = await asaasFetch<CheckoutResponse>("/checkouts", {
        method: "POST",
        body: JSON.stringify(build(false)),
      });
    } else {
      throw new Error(msg || "Falha ao abrir o checkout da Asaas");
    }
  }

  console.info("[asaas] checkout created", { id: res?.id, status: res?.status, hasLink: Boolean(res?.link) });
  if (!res?.id || !res?.link) throw new Error("Asaas não retornou o link do checkout");
  return { id: res.id, url: res.link };
}




/* ============================================================
 * Checkout TRANSPARENTE de cartão (cartão digitado no nosso site)
 *
 * HIGIENE OBRIGATÓRIA:
 * - O número do cartão e o CVV só existem em memória durante esta chamada.
 * - NUNCA logamos, gravamos ou retornamos número/CVV/validade.
 * - Só o id da cobrança e o status podem ser persistidos.
 * ============================================================ */

export type TransparentCardInput = {
  customerId: string;
  /** Valor total da compra (será dividido em installmentCount parcelas). */
  value: number;
  externalReference: string;
  description: string;
  installmentCount?: number;
  /** IP do DISPOSITIVO do cliente (x-forwarded-for), nunca o IP do servidor. */
  remoteIp: string;
  card: {
    holderName: string;
    number: string;
    expiryMonth: string;
    expiryYear: string;
    ccv: string;
  };
  holderInfo: {
    name: string;
    email: string;
    cpfCnpj: string;
    postalCode: string;
    addressNumber: string;
    phone: string;
  };
};

export type TransparentCardResult = {
  id: string;
  status: string;
  installmentCount: number;
  /** Só para fallback/consulta; nunca contém dados do cartão. */
  invoiceUrl?: string | null;
};

/** true quando o status da Asaas significa "pagamento aprovado". */
export function isApprovedStatus(status: string): boolean {
  return ["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"].includes((status || "").toUpperCase());
}

/**
 * Cria a cobrança de cartão enviando os dados do cartão direto para a API da
 * Asaas (uma única autorização; parcelamento no cartão via installmentCount +
 * totalValue, sem carnê de faturas futuras).
 */
export async function createTransparentCardPayment(
  input: TransparentCardInput,
): Promise<TransparentCardResult> {
  const installments = Math.max(1, Math.floor(input.installmentCount ?? 1));
  const total = Number(input.value.toFixed(2));

  const body: Record<string, unknown> = {
    customer: input.customerId,
    billingType: "CREDIT_CARD",
    dueDate: tomorrowIso(),
    externalReference: input.externalReference,
    description: input.description.slice(0, 500),
    remoteIp: input.remoteIp,
    creditCard: {
      holderName: input.card.holderName.trim().slice(0, 100),
      number: input.card.number.replace(/\D/g, ""),
      expiryMonth: input.card.expiryMonth.padStart(2, "0"),
      expiryYear: input.card.expiryYear,
      ccv: input.card.ccv.replace(/\D/g, ""),
    },
    creditCardHolderInfo: {
      name: input.holderInfo.name.trim().slice(0, 100),
      email: input.holderInfo.email.trim(),
      cpfCnpj: input.holderInfo.cpfCnpj.replace(/\D/g, ""),
      postalCode: input.holderInfo.postalCode.replace(/\D/g, ""),
      addressNumber: String(input.holderInfo.addressNumber || "S/N").slice(0, 10),
      phone: input.holderInfo.phone.replace(/\D/g, ""),
    },
  };
  if (installments > 1) {
    body.installmentCount = installments;
    body.totalValue = total;
  } else {
    body.value = total;
  }

  // asaasFetch loga apenas path/status/resposta da Asaas — nunca o corpo enviado.
  const payment = await asaasFetch<{ id?: string; status?: string; invoiceUrl?: string | null }>(
    "/payments",
    { method: "POST", body: JSON.stringify(body) },
  );
  if (!payment?.id) throw new Error("Asaas não retornou a cobrança do cartão");
  return {
    id: payment.id,
    status: String(payment.status ?? ""),
    installmentCount: installments,
    invoiceUrl: payment.invoiceUrl ?? null,
  };
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


export type AsaasPaymentSummary = {
  id: string;
  status: string;
  billingType?: string | null;
  value?: number;
  netValue?: number;
  dateCreated?: string | null;
  dueDate?: string | null;
  description?: string | null;
  externalReference?: string | null;
  invoiceUrl?: string | null;
  confirmedDate?: string | null;
  creditCard?: { creditCardBrand?: string | null } | null;
  /** Campos de recusa/análise que a Asaas pode devolver. */
  refusalReason?: string | null;
  transactionReceiptUrl?: string | null;
  deleted?: boolean;
};

/**
 * SOMENTE LEITURA: lista cobranças criadas a partir de uma data (yyyy-mm-dd),
 * paginando até `maxPages` páginas de 100. Não cria nem altera nada.
 */
export async function listPaymentsCreatedSince(
  sinceDate: string,
  maxPages = 20,
): Promise<AsaasPaymentSummary[]> {
  const all: AsaasPaymentSummary[] = [];
  for (let page = 0; page < maxPages; page++) {
    const res = await asaasFetch<{ data?: AsaasPaymentSummary[]; hasMore?: boolean }>(
      `/payments?dateCreated%5Bge%5D=${encodeURIComponent(sinceDate)}&limit=100&offset=${page * 100}`,
      { method: "GET" },
    );
    const rows = res?.data ?? [];
    all.push(...rows);
    if (!res?.hasMore || rows.length === 0) break;
  }
  return all;
}
