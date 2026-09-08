import { supabase } from "@/integrations/supabase/client";

/**
 * Consultas da área do cliente logado.
 *
 * Tudo aqui usa o cliente autenticado do navegador: as políticas do banco
 * continuam valendo (o cliente só enxerga o que é dele) E ainda filtramos
 * explicitamente pelo dono (`user_id`), do mesmo jeito que a lista de pedidos
 * já fazia. Nenhuma nova função de servidor, nenhum acesso privilegiado.
 */

export type MyOrderItem = {
  id: string;
  product_id: string | null;
  product_name: string;
  unit_price: number;
  quantity: number;
  variant_color: string | null;
};

export type MyOrder = {
  id: string;
  status: string;
  fulfillment_status: string;
  total: number;
  delivery_fee: number;
  cashback_used: number;
  cashback_earned: number;
  payment_method: string;
  delivery_method: string | null;
  created_at: string;
  delivered_at: string | null;
  shipping_street: string | null;
  shipping_number: string | null;
  shipping_complement: string | null;
  shipping_district: string | null;
  shipping_city: string | null;
  shipping_state: string | null;
  maisentregas_status: string | null;
  maisentregas_tracking_url: string | null;
};

const ORDER_COLS =
  "id, status, fulfillment_status, total, delivery_fee, cashback_used, cashback_earned, payment_method, delivery_method, created_at, delivered_at, shipping_street, shipping_number, shipping_complement, shipping_district, shipping_city, shipping_state, maisentregas_status, maisentregas_tracking_url";

/** Id do usuário atual, ou null quando não há sessão. */
export async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/**
 * Detalhe do pedido do próprio cliente. Retorna `null` quando o pedido não é
 * dele (ou não existe) — a página pública mascarada continua responsável pelo
 * acompanhamento por link compartilhado.
 */
export async function fetchMyOrder(orderId: string, userId: string) {
  const { data: order, error } = await supabase
    .from("orders")
    .select(ORDER_COLS)
    .eq("id", orderId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!order) return { order: null as MyOrder | null, items: [] as MyOrderItem[] };

  const { data: items, error: ie } = await supabase
    .from("order_items")
    .select("id, product_id, product_name, unit_price, quantity, variant_color")
    .eq("order_id", orderId);
  if (ie) throw ie;

  return { order: order as unknown as MyOrder, items: (items ?? []) as MyOrderItem[] };
}

export type CashbackEntry = {
  id: string;
  kind: string;
  amount: number;
  consumed: number;
  order_id: string | null;
  expires_at: string | null;
  expired_at: string | null;
  created_at: string;
};

/** Extrato de cashback do próprio cliente. */
export async function fetchMyCashbackLedger(userId: string) {
  const { data, error } = await supabase
    .from("cashback_entries")
    .select("id, kind, amount, consumed, order_id, expires_at, expired_at, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as CashbackEntry[];
}

/** Percentual de cashback vigente (site_settings é leitura pública). */
export async function fetchCashbackRate(): Promise<number | null> {
  const { data, error } = await supabase
    .from("site_settings")
    .select("cashback_rate")
    .eq("id", 1)
    .maybeSingle();
  if (error) return null;
  const rate = Number(data?.cashback_rate ?? 0);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

export type RepurchaseItem = {
  order_item_id: string;
  product_id: string | null;
  requested_name: string;
  requested_quantity: number;
  requested_variant: string | null;
  /** Estado ATUAL do produto — nunca reutilizamos o preço antigo do pedido. */
  reason: "ok" | "removed" | "inactive" | "out_of_stock" | "variant_gone" | "needs_choice";
  product: {
    id: string;
    name: string;
    price: number;
    image_url: string | null;
    stock: number;
    unidade_id: string | null;
    variant_color: string | null;
  } | null;
};

type VariantRow = { color?: string; stock?: number };

/**
 * Prepara a recompra relendo preço, estoque e variantes ATUAIS.
 * Nada é adicionado aqui: quem adiciona é a função `add` do carrinho, que já
 * faz a reserva de estoque no servidor.
 *
 * `needs_choice`: o produto passou a exigir escolha de cor (ou a cor antiga
 * sumiu, mas existem outras) — nesse caso mandamos o cliente para a página do
 * produto escolher, em vez de adivinhar a variante.
 */
export async function buildRepurchasePlan(orderId: string, userId: string): Promise<RepurchaseItem[]> {
  const { data: order, error: oe } = await supabase
    .from("orders")
    .select("id")
    .eq("id", orderId)
    .eq("user_id", userId)
    .maybeSingle();
  if (oe) throw oe;
  if (!order) throw new Error("Pedido não encontrado");

  const { data: items, error } = await supabase
    .from("order_items")
    .select("id, product_id, product_name, quantity, variant_color")
    .eq("order_id", orderId);
  if (error) throw error;

  const ids = Array.from(
    new Set((items ?? []).map((i) => i.product_id).filter((v): v is string => !!v)),
  );

  type ProductRow = {
    id: string;
    name: string;
    price: number;
    image_url: string | null;
    stock: number;
    active: boolean;
    unidade_id: string | null;
    color_variants: unknown;
  };
  let products: ProductRow[] = [];
  if (ids.length > 0) {
    const { data: prods, error: pe } = await supabase
      .from("products")
      .select("id, name, price, image_url, stock, active, unidade_id, color_variants")
      .in("id", ids);
    if (pe) throw pe;
    products = (prods ?? []) as unknown as ProductRow[];
  }
  const byId = new Map(products.map((p) => [p.id, p]));

  return (items ?? []).map((it) => {
    const base = {
      order_item_id: it.id,
      product_id: it.product_id ?? null,
      requested_name: it.product_name,
      requested_quantity: it.quantity,
      requested_variant: it.variant_color ?? null,
    };
    const p = it.product_id ? byId.get(it.product_id) : undefined;
    if (!p) return { ...base, reason: "removed" as const, product: null };
    if (!p.active) return { ...base, reason: "inactive" as const, product: null };

    const variants: VariantRow[] = Array.isArray(p.color_variants) ? (p.color_variants as VariantRow[]) : [];
    const norm = (s: string) => s.toLowerCase().trim();

    let variantStock = Number(p.stock);
    let chosenColor: string | null = null;

    if (variants.length > 0) {
      if (!it.variant_color) {
        // Produto passou a ter variantes: o cliente precisa escolher.
        return { ...base, reason: "needs_choice" as const, product: shallow(p, null, Number(p.stock)) };
      }
      const match = variants.find((v) => norm(v.color ?? "") === norm(it.variant_color!));
      if (!match) {
        // A cor comprada não existe mais, mas há outras: leva ao produto.
        return { ...base, reason: "variant_gone" as const, product: shallow(p, null, Number(p.stock)) };
      }
      variantStock = Number(match.stock ?? 0);
      chosenColor = match.color ?? it.variant_color;
    } else if (it.variant_color) {
      // Antes tinha cor, hoje o produto é único: adicionamos sem cor.
      chosenColor = null;
    }

    if (Number(p.stock) <= 0 || variantStock <= 0) {
      return { ...base, reason: "out_of_stock" as const, product: null };
    }

    return { ...base, reason: "ok" as const, product: shallow(p, chosenColor, Math.min(Number(p.stock), variantStock)) };
  });
}

function shallow(
  p: { id: string; name: string; price: number; image_url: string | null; unidade_id: string | null },
  variant_color: string | null,
  stock: number,
) {
  return {
    id: p.id,
    name: p.name,
    price: Number(p.price),
    image_url: p.image_url,
    stock,
    unidade_id: p.unidade_id ?? null,
    variant_color,
  };
}
