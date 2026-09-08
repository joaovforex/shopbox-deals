/**
 * Camada de eventos de e-commerce (padrão GA4 / dataLayer).
 *
 * - NÃO instala nenhum script externo. Apenas empurra eventos para
 *   `window.dataLayer`, que um GTM/GA4 pode consumir quando for configurado.
 * - Se `VITE_GA4_MEASUREMENT_ID` (ou o connector do Google Analytics) existir,
 *   os mesmos eventos são enviados via `gtag` quando ele estiver presente.
 * - NUNCA envie dados pessoais (CPF, e-mail, telefone, endereço, nome).
 *
 * IDs necessários para ativar a medição de verdade (ainda não configurados):
 *   VITE_GA4_MEASUREMENT_ID           → GA4 (G-XXXXXXX)
 *   VITE_META_PIXEL_ID                → Meta Pixel (opcional)
 */

type Json = Record<string, unknown>;

export type AnalyticsItem = {
  item_id: string;
  item_name: string;
  price: number;
  quantity?: number;
  item_category?: string | null;
  item_brand?: string | null;
};

declare global {
  interface Window {
    dataLayer?: Json[];
    gtag?: (...args: unknown[]) => void;
  }
}

export function ga4MeasurementId(): string | undefined {
  const env = import.meta.env as Record<string, string | undefined>;
  return (
    env.VITE_GA4_MEASUREMENT_ID ||
    env.VITE_LOVABLE_CONNECTOR_GOOGLE_ANALYTICS_API_KEY ||
    undefined
  );
}

/** Remove chaves nulas/indefinidas e nunca deixa passar campos pessoais. */
const BLOCKED = new Set([
  "email",
  "cpf",
  "phone",
  "telefone",
  "address",
  "endereco",
  "name",
  "full_name",
  "zip",
  "cep",
]);

function sanitize<T extends Json>(obj: T): Json {
  const out: Json = {};
  for (const [k, v] of Object.entries(obj)) {
    if (BLOCKED.has(k.toLowerCase())) continue;
    if (v === undefined || v === null) continue;
    out[k] = v;
  }
  return out;
}

export function pushEvent(event: string, params: Json = {}): void {
  if (typeof window === "undefined") return;
  const payload = { event, ...sanitize(params) };
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(payload);
  if (typeof window.gtag === "function" && ga4MeasurementId()) {
    window.gtag("event", event, sanitize(params));
  }
}

export function toAnalyticsItem(p: {
  id: string;
  name: string;
  price: number;
  category?: string | null;
  brand?: string | null;
}, quantity = 1): AnalyticsItem {
  return {
    item_id: p.id,
    item_name: p.name,
    price: Number(p.price),
    quantity,
    ...(p.category ? { item_category: p.category } : {}),
    ...(p.brand ? { item_brand: p.brand } : {}),
  };
}

export function trackViewItem(item: AnalyticsItem) {
  pushEvent("view_item", { currency: "BRL", value: item.price, items: [item] });
}

export function trackViewItemList(listName: string, items: AnalyticsItem[]) {
  if (items.length === 0) return;
  pushEvent("view_item_list", { item_list_name: listName, items });
}

export function trackAddToCart(item: AnalyticsItem) {
  pushEvent("add_to_cart", {
    currency: "BRL",
    value: Number(item.price) * (item.quantity ?? 1),
    items: [item],
  });
}

export function trackBeginCheckout(items: AnalyticsItem[], value: number) {
  pushEvent("begin_checkout", { currency: "BRL", value, items });
}

/**
 * `purchase` só deve ser disparado numa tela que confirma pedido PAGO.
 * Deduplicado por order id em sessionStorage.
 */
export function trackPurchase(args: {
  orderId: string;
  value: number;
  shipping?: number;
  items: AnalyticsItem[];
}): void {
  if (typeof window === "undefined") return;
  const key = `sb_purchase_sent_${args.orderId}`;
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
  } catch {
    /* sessão indisponível: segue e dispara uma vez por carregamento */
  }
  pushEvent("purchase", {
    transaction_id: args.orderId,
    currency: "BRL",
    value: args.value,
    ...(args.shipping ? { shipping: args.shipping } : {}),
    items: args.items,
  });
}
