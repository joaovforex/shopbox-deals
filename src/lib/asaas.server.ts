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
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        // A Asaas exige User-Agent em todas as requisições.
        "User-Agent": "Shopbox/1.0 (+https://shopboxonline.com)",
        access_token: apiKey(),
        ...(init?.headers as Record<string, string> | undefined),
      },
    });
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
  return created.id;
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

/** Cria a cobrança com billingType UNDEFINED (cliente escolhe Pix/cartão/boleto). */
export async function createPayment(input: CreatePaymentInput): Promise<AsaasPayment> {
  const body: Record<string, unknown> = {
    customer: input.customerId,
    billingType: "UNDEFINED",
    value: Number(input.value.toFixed(2)),
    dueDate: input.dueDate ?? tomorrowIso(),
    externalReference: input.externalReference,
    description: input.description.slice(0, 500),
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
