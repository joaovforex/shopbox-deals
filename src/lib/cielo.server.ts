// Server-only: cliente HTTP da Cielo Checkout (produção).
// Nunca importar direto de arquivos client-reachable — só de dentro de
// handlers de server functions / server routes.

const CIELO_BASE = "https://cieloecommerce.cielo.com.br";
const TOKEN_URL = `${CIELO_BASE}/api/public/v2/token`;
const ORDERS_URL = `${CIELO_BASE}/api/public/v1/orders`;

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 30_000) {
    return cachedToken.value;
  }

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

  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    value: json.access_token,
    expiresAt: now + Math.max(60_000, (json.expires_in ?? 1200) * 1000),
  };
  return cachedToken.value;
}

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
    | { type: "Fixed"; priceCents: number; address: CieloShippingAddress };
  maxInstallments: number;
  returnUrl: string;
  webhookUrl: string;
  customer?: {
    name: string;
    email?: string;
    identity?: string; // CPF
    identityType?: "CPF" | "CNPJ";
    phone?: string;
  };
};

export type CreateCheckoutResult = {
  checkoutUrl: string;
  merchantOrderId: string;
};

export async function createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
  const token = await getAccessToken();

  const payload: Record<string, unknown> = {
    OrderNumber: input.orderNumber,
    SoftDescriptor: input.softDescriptor.slice(0, 13),
    Cart: {
      Items: input.items.map((it) => ({
        Name: it.name.slice(0, 128),
        UnitPrice: it.unitPriceCents,
        Quantity: it.quantity,
        Type: "Asset",
        Sku: (it.sku ?? input.orderNumber).slice(0, 50),
      })),
    },
    Shipping:
      input.shipping?.type === "Fixed"
        ? {
            Type: "Fixed",
            SourceZipCode: input.shipping.address.zipCode,
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
              ZipCode: input.shipping.address.zipCode,
            },
          }
        : { Type: "WithoutShipping" },
    Payment: {
      BoletoDiscount: 0,
      DebitDiscount: 0,
      MaxNumberOfInstallments: Math.max(1, Math.min(12, input.maxInstallments)),
    },
    Options: {
      AntifraudEnabled: false,
      ReturnUrl: input.returnUrl,
    },
  };

  if (input.customer) {
    payload.Customer = {
      Name: input.customer.name,
      Email: input.customer.email ?? "",
      Identity: input.customer.identity ?? "",
      IdentityType: input.customer.identityType ?? "CPF",
      Phone: input.customer.phone ?? "",
    };
  }

  const res = await fetch(ORDERS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[cielo] create checkout error", res.status, text);
    throw new Error("Falha ao criar checkout na Cielo");
  }

  const json = (await res.json()) as {
    settings?: { checkoutUrl?: string };
    merchantOrderId?: string;
  };

  if (!json.settings?.checkoutUrl) {
    console.error("[cielo] resposta sem checkoutUrl", json);
    throw new Error("Resposta inválida da Cielo");
  }

  return {
    checkoutUrl: json.settings.checkoutUrl,
    merchantOrderId: json.merchantOrderId ?? input.orderNumber,
  };
}

export type CieloOrderStatus = {
  paymentId: string;
  status: number; // 0 not finished, 1 authorized, 2 paid, 3 denied, 10 voided, 11 refunded, 12 pending, 13 aborted, 20 scheduled
  paymentType?: string; // "CreditCard" | "DebitCard" | "Pix" | "Boleto"
  installments?: number;
  tid?: string;
  authorizationCode?: string;
  returnCode?: string;
  returnMessage?: string;
  orderNumber?: string;
  amount?: number; // cents
};

export async function getOrder(paymentId: string): Promise<CieloOrderStatus | null> {
  const token = await getAccessToken();
  const res = await fetch(`${ORDERS_URL}/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[cielo] get order error", res.status, text);
    throw new Error("Falha ao consultar pedido na Cielo");
  }
  const json = (await res.json()) as {
    payment?: {
      paymentId: string;
      status: number;
      type?: string;
      installments?: number;
      tid?: string;
      authorizationCode?: string;
      returnCode?: string;
      returnMessage?: string;
      amount?: number;
    };
    orderNumber?: string;
  };
  const p = json.payment;
  if (!p) return null;
  return {
    paymentId: p.paymentId,
    status: p.status,
    paymentType: p.type,
    installments: p.installments,
    tid: p.tid,
    authorizationCode: p.authorizationCode,
    returnCode: p.returnCode,
    returnMessage: p.returnMessage,
    orderNumber: json.orderNumber,
    amount: p.amount,
  };
}

export async function voidOrder(paymentId: string, amountCents?: number): Promise<boolean> {
  const token = await getAccessToken();
  const url = `${ORDERS_URL}/${encodeURIComponent(paymentId)}/void${
    amountCents ? `?amount=${amountCents}` : ""
  }`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[cielo] void error", res.status, text);
    return false;
  }
  return true;
}

// Mapeia status numérico da Cielo para nossos estados internos
export function mapCieloStatus(status: number): {
  cielo_status: string;
  order_action: "paid" | "cancelled" | "pending" | "noop";
} {
  switch (status) {
    case 1: // Authorized (aguarda captura)
    case 2: // Paid / Captured
      return { cielo_status: "paid", order_action: "paid" };
    case 3: // Denied
      return { cielo_status: "denied", order_action: "cancelled" };
    case 10: // Voided
    case 13: // Aborted
      return { cielo_status: "voided", order_action: "cancelled" };
    case 11: // Refunded
      return { cielo_status: "refunded", order_action: "cancelled" };
    case 0:
    case 12: // Pending
    case 20: // Scheduled
      return { cielo_status: "pending", order_action: "pending" };
    default:
      return { cielo_status: `unknown_${status}`, order_action: "noop" };
  }
}
