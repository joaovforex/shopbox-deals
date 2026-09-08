import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Área do cliente logado.
 *
 * Todas as leituras aqui usam o cliente autenticado (`context.supabase`), ou
 * seja, as políticas do banco continuam valendo: o cliente só enxerga os
 * próprios pedidos, itens e cashback. Nenhuma delas usa service role.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type MyOrderItem = {
  id: string;
  product_id: string | null;
  product_name: string;
  unit_price: number;
  quantity: number;
  variant_color: string | null;
};

/**
 * Detalhe COMPLETO do pedido do próprio cliente (sem máscara de PII, porque
 * quem lê é o dono autenticado). A rota pública `/pedido/$id` continua usando
 * `getPublicOrder`, que mascara os dados para links compartilhados.
 */
export const getMyOrder = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => {
    if (!data?.id || !UUID_RE.test(data.id)) throw new Error("Pedido inválido");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { data: order, error } = await context.supabase
      .from("orders")
      .select(
        "id, status, fulfillment_status, total, delivery_fee, cashback_used, cashback_earned, payment_method, payment_provider, cielo_payment_method, cielo_card_brand, cielo_installments, delivery_method, created_at, delivered_at, customer_name, customer_phone, shipping_zip, shipping_street, shipping_number, shipping_complement, shipping_district, shipping_city, shipping_state, maisentregas_status, maisentregas_tracking_url",
      )
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!order) return { order: null, items: [] as MyOrderItem[] };

    const { data: items, error: ie } = await context.supabase
      .from("order_items")
      .select("id, product_id, product_name, unit_price, quantity, variant_color")
      .eq("order_id", data.id);
    if (ie) throw new Error(ie.message);

    return { order, items: (items ?? []) as MyOrderItem[] };
  });

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

/**
 * Extrato de cashback do cliente: entradas, quanto já foi usado de cada uma,
 * validade e o que expirou. Serve de histórico para o saldo já exposto por
 * `getMyCashback`.
 */
export const getMyCashbackLedger = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("cashback_entries")
      .select("id, kind, amount, consumed, order_id, expires_at, expired_at, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return { entries: (data ?? []) as CashbackEntry[] };
  });

export type RepurchaseItem = {
  order_item_id: string;
  product_id: string | null;
  requested_name: string;
  requested_quantity: number;
  requested_variant: string | null;
  /** Estado ATUAL do produto — nunca reutilizamos o preço antigo do pedido. */
  available: boolean;
  reason: "ok" | "removed" | "inactive" | "out_of_stock" | "variant_gone";
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

/**
 * Prepara a recompra: relê preço, estoque, variante e situação atual de cada
 * item do pedido. Nada aqui adiciona ao carrinho — quem adiciona é a função
 * `add` do carrinho no cliente, que já faz a reserva de estoque no servidor.
 */
export const getRepurchasePlan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { orderId: string }) => {
    if (!data?.orderId || !UUID_RE.test(data.orderId)) throw new Error("Pedido inválido");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { data: order, error: oe } = await context.supabase
      .from("orders")
      .select("id")
      .eq("id", data.orderId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (oe) throw new Error(oe.message);
    if (!order) throw new Error("Pedido não encontrado");

    const { data: items, error } = await context.supabase
      .from("order_items")
      .select("id, product_id, product_name, quantity, variant_color")
      .eq("order_id", data.orderId);
    if (error) throw new Error(error.message);

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
      const { data: prods, error: pe } = await context.supabase
        .from("products")
        .select("id, name, price, image_url, stock, active, unidade_id, color_variants")
        .in("id", ids);
      if (pe) throw new Error(pe.message);
      products = (prods ?? []) as ProductRow[];
    }
    const byId = new Map(products.map((p) => [p.id, p]));

    const plan: RepurchaseItem[] = (items ?? []).map((it) => {
      const base = {
        order_item_id: it.id,
        product_id: it.product_id ?? null,
        requested_name: it.product_name,
        requested_quantity: it.quantity,
        requested_variant: it.variant_color ?? null,
      };
      const p = it.product_id ? byId.get(it.product_id) : undefined;
      if (!p) return { ...base, available: false, reason: "removed" as const, product: null };
      if (!p.active) return { ...base, available: false, reason: "inactive" as const, product: null };

      // Variante: se o pedido tinha cor, ela precisa existir hoje e ter estoque.
      const variants = Array.isArray(p.color_variants)
        ? (p.color_variants as Array<{ color?: string; stock?: number }>)
        : [];
      let variantStock = p.stock;
      if (it.variant_color) {
        const match = variants.find(
          (v) => (v.color ?? "").toLowerCase().trim() === it.variant_color!.toLowerCase().trim(),
        );
        if (!match) return { ...base, available: false, reason: "variant_gone" as const, product: null };
        variantStock = Number(match.stock ?? 0);
      }
      if (variantStock <= 0 || p.stock <= 0) {
        return { ...base, available: false, reason: "out_of_stock" as const, product: null };
      }

      return {
        ...base,
        available: true,
        reason: "ok" as const,
        product: {
          id: p.id,
          name: p.name,
          price: Number(p.price),
          image_url: p.image_url,
          stock: Math.min(Number(p.stock), Number(variantStock)),
          unidade_id: p.unidade_id ?? null,
          variant_color: it.variant_color ?? null,
        },
      };
    });

    return { items: plan };
  });
