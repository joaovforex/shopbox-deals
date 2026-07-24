import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ProductReview = {
  id: string;
  product_id: string;
  user_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  updated_at: string;
};

export type ReviewsSummary = {
  count: number;
  average: number; // 0..5
};

export async function fetchProductReviews(productId: string): Promise<ProductReview[]> {
  const { data, error } = await supabase
    .from("product_reviews")
    .select("*")
    .eq("product_id", productId)
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data ?? []) as ProductReview[];
}

export async function fetchReviewsSummary(productId: string): Promise<ReviewsSummary> {
  const { data, error } = await supabase
    .from("product_reviews")
    .select("rating")
    .eq("product_id", productId);
  if (error || !data || data.length === 0) return { count: 0, average: 0 };
  const total = data.reduce((s, r) => s + Number(r.rating || 0), 0);
  return { count: data.length, average: total / data.length };
}

export const productReviewsQuery = (productId: string) =>
  queryOptions({
    queryKey: ["reviews", productId],
    queryFn: () => fetchProductReviews(productId),
    staleTime: 30_000,
  });

export const reviewsSummaryQuery = (productId: string) =>
  queryOptions({
    queryKey: ["reviews-summary", productId],
    queryFn: () => fetchReviewsSummary(productId),
    staleTime: 60_000,
  });

export async function fetchUserPurchasedProduct(
  userId: string,
  productId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("order_items")
    .select("order_id, orders!inner(user_id, status)")
    .eq("product_id", productId)
    .eq("orders.user_id", userId)
    .eq("orders.status", "paid")
    .limit(1);
  if (error) return false;
  return (data ?? []).length > 0;
}

export const userPurchasedProductQuery = (userId: string | undefined, productId: string) =>
  queryOptions({
    queryKey: ["purchased", userId ?? "anon", productId],
    queryFn: () => (userId ? fetchUserPurchasedProduct(userId, productId) : Promise.resolve(false)),
    enabled: !!userId,
    staleTime: 60_000,
  });

// Regra: apenas quem comprou o produto (pedido pago) pode avaliar. A RLS
// no banco também garante isso; aqui damos uma mensagem amigável antes.

export async function submitReview(input: {
  productId: string;
  rating: number;
  comment: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { ok: false, error: "Faça login para avaliar." };
  const purchased = await fetchUserPurchasedProduct(user.id, input.productId);
  if (!purchased) {
    return { ok: false, error: "Somente quem comprou este produto pode avaliar." };
  }
  const { error } = await supabase
    .from("product_reviews")
    .upsert(
      {
        product_id: input.productId,
        user_id: user.id,
        rating: input.rating,
        comment: input.comment?.trim() || null,
      },
      { onConflict: "product_id,user_id" },
    );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

