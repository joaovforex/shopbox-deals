import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ReserveResult =
  | "reserved"
  | "kept_reservation"
  | "not_last"
  | "out_of_stock"
  | "insufficient_stock"
  | "invalid_color"
  | "not_found";

export const reserveCartLastStock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { productId: string; variantColor?: string | null; quantity: number }) => data,
  )
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("reserve_cart_last_stock", {
      p_product_id: data.productId,
      p_variant_color: (data.variantColor ?? null) as string,
      p_quantity: data.quantity,
    });
    if (error) throw new Error(error.message);
    return { status: (res as ReserveResult) ?? "not_found" };
  });


export const releaseCartReservation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { productId: string; variantColor?: string | null }) => data)
  .handler(async ({ data, context }) => {
    const { data: ok, error } = await context.supabase.rpc("release_cart_reservation", {
      p_product_id: data.productId,
      p_variant_color: (data.variantColor ?? null) as string,
    });

    if (error) throw new Error(error.message);
    return { released: !!ok };
  });

export const listMyReservations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("cart_reservations")
      .select("product_id, variant_color, quantity, expires_at")
      .gt("expires_at", new Date().toISOString());
    if (error) throw new Error(error.message);
    return data ?? [];
  });
