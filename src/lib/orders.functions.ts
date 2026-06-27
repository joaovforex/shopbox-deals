import { createServerFn } from "@tanstack/react-start";

// Fetch a single order + items by UUID. The UUID itself is the access token
// (unguessable) so this is safe to expose unauthenticated for the post-checkout
// confirmation page. We use supabaseAdmin to bypass RLS but scope by id.
export const getPublicOrder = createServerFn({ method: "GET" })
  .inputValidator((data: { id: string }) => {
    if (!data?.id || typeof data.id !== "string") throw new Error("ID inválido");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.id)) {
      throw new Error("ID inválido");
    }
    return data;
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select("id, status, fulfillment_status, total, customer_name, customer_email, customer_phone, payment_method, delivery_method, created_at, shipping_zip, shipping_street, shipping_number, shipping_complement, shipping_district, shipping_city, shipping_state, maisentregas_status, maisentregas_tracking_url, mp_payment_status, mp_status_detail, mp_payment_method_id")

      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!order) return { order: null, items: [] as Array<{ id: string; product_name: string; unit_price: number; quantity: number }> };

    const { data: items, error: ie } = await supabaseAdmin
      .from("order_items")
      .select("id, product_name, unit_price, quantity")
      .eq("order_id", data.id);
    if (ie) throw new Error(ie.message);

    return { order, items: items ?? [] };
  });
