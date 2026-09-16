/**
 * Cálculo (server-side) do subtotal ELEGÍVEL a abatimento de cashback.
 *
 * Regra: o cliente só pode abater saldo de cashback no preço de produtos com
 * `products.cashback_redeemable = true` (padrão). Produtos marcados como
 * não-elegíveis não entram no teto. Itens cujo produto já foi removido são
 * tratados como elegíveis (preserva o comportamento anterior).
 *
 * É a fonte de verdade do teto de cashback — nunca confiar no valor do cliente.
 */

type OrderItemLike = {
  product_id?: string | null;
  unit_price: number | string;
  quantity: number | string;
};

// Cliente Supabase (admin) — tipado de forma frouxa para não acoplar aos tipos gerados
// nem disparar instanciação de tipo profunda. Passe o supabaseAdmin com um cast.
export type CashbackQueryClient = {
  from: (table: string) => {
    select: (cols: string) => {
      in: (col: string, values: string[]) => {
        eq: (col: string, value: unknown) => PromiseLike<{ data: Array<{ id: string }> | null; error: unknown }>;
      };
    };
  };
};

export async function computeCashbackEligibleSubtotal(
  client: CashbackQueryClient,
  items: OrderItemLike[],
  fallbackSubtotal: number,
): Promise<number> {
  const lineTotal = (it: OrderItemLike) => Number(it.unit_price) * Number(it.quantity);

  const productIds = Array.from(
    new Set(items.map((it) => it.product_id).filter((x): x is string => !!x)),
  );
  if (productIds.length === 0) return fallbackSubtotal;

  const { data: blockedRows, error } = await client
    .from("products")
    .select("id")
    .in("id", productIds)
    .eq("cashback_redeemable", false);

  // Em caso de erro na leitura, não amplia o teto: mantém o subtotal (comportamento seguro atual).
  if (error) return fallbackSubtotal;

  const blocked = new Set((blockedRows ?? []).map((r) => r.id));
  if (blocked.size === 0) return fallbackSubtotal;

  return items.reduce((acc, it) => {
    if (it.product_id && blocked.has(it.product_id)) return acc;
    return acc + lineTotal(it);
  }, 0);
}
