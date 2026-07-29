import { createServerFn } from "@tanstack/react-start";

// Máscaras defensivas — o UUID é o "token" público mas ainda assim não expomos
// PII bruta na tela de confirmação. Só o dono do pedido (logado) vê o dado
// completo via /meus-pedidos.
function maskEmail(v: string | null | undefined): string | null {
  if (!v) return null;
  const [user, domain] = v.split("@");
  if (!user || !domain) return null;
  const u = user.length <= 2 ? user[0] + "*" : user.slice(0, 2) + "*".repeat(Math.max(1, user.length - 2));
  return `${u}@${domain}`;
}
function maskPhone(v: string | null | undefined): string | null {
  if (!v) return null;
  const digits = v.replace(/\D/g, "");
  if (digits.length < 4) return null;
  const tail = digits.slice(-2);
  const head = digits.slice(0, 2);
  return `(${head}) *****-**${tail}`;
}
function maskName(v: string | null | undefined): string | null {
  if (!v) return null;
  const parts = v.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]!;
  return `${parts[0]} ${parts[parts.length - 1]![0]!.toUpperCase()}.`;
}

// Fetch a single order + items by UUID. The UUID itself is the access token
// (unguessable) so this is safe to expose unauthenticated for the post-checkout
// confirmation page. Retornamos apenas o mínimo necessário e mascaramos PII.
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
      .select(
        "id, status, fulfillment_status, total, customer_name, customer_email, customer_phone, payment_method, delivery_method, created_at, shipping_city, shipping_state, maisentregas_status, maisentregas_tracking_url, mp_payment_status, mp_status_detail, mp_payment_method_id",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!order) return { order: null, items: [] as Array<{ id: string; product_name: string; unit_price: number; quantity: number }> };

    const { data: items, error: ie } = await supabaseAdmin
      .from("order_items")
      .select("id, product_name, unit_price, quantity")
      .eq("order_id", data.id);
    if (ie) throw new Error(ie.message);

    const safe = {
      id: order.id,
      status: order.status,
      fulfillment_status: order.fulfillment_status,
      total: order.total,
      customer_name: maskName(order.customer_name),
      customer_email: maskEmail(order.customer_email),
      customer_phone: maskPhone(order.customer_phone),
      payment_method: order.payment_method,
      delivery_method: order.delivery_method,
      created_at: order.created_at,
      // Endereço: só cidade/UF para confirmação — nunca rua/número/complemento/CEP.
      shipping_city: order.shipping_city ?? null,
      shipping_state: order.shipping_state ?? null,
      maisentregas_status: order.maisentregas_status ?? null,
      maisentregas_tracking_url: order.maisentregas_tracking_url ?? null,
      mp_payment_status: order.mp_payment_status ?? null,
      mp_status_detail: order.mp_status_detail ?? null,
      mp_payment_method_id: order.mp_payment_method_id ?? null,
    };

    return { order: safe, items: items ?? [] };
  });
