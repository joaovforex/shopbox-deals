import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { brl, notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_order",
  title: "Detalhes do pedido",
  description: "Mostra os itens e o status de entrega de um pedido do usuário conectado.",
  inputSchema: { id: z.string().uuid().describe("Id do pedido.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ id }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    const { data: order, error } = await supabase
      .from("orders")
      .select(
        "id,created_at,status,fulfillment_status,total,delivery_fee,delivery_method,payment_method,shipping_city,shipping_state,delivered_at,maisentregas_tracking_url"
      )
      .eq("id", id)
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!order) return { content: [{ type: "text", text: "Pedido não encontrado." }], isError: true };

    const { data: items } = await supabase
      .from("order_items")
      .select("product_name,quantity,unit_price,variant_color")
      .eq("order_id", id);

    const lines = [
      `Pedido #${String(order.id).slice(0, 8).toUpperCase()}`,
      `Data: ${new Date(order.created_at as string).toLocaleString("pt-BR")}`,
      `Pagamento: ${order.status} (${order.payment_method ?? "-"})`,
      `Etapa: ${order.fulfillment_status ?? "-"}${order.delivered_at ? ` · entregue em ${new Date(order.delivered_at as string).toLocaleString("pt-BR")}` : ""}`,
      `Entrega: ${order.delivery_method ?? "-"}${order.delivery_fee ? ` · frete ${brl(order.delivery_fee)}` : ""}`,
      order.maisentregas_tracking_url ? `Rastreio: ${order.maisentregas_tracking_url}` : "",
      "",
      "Itens:",
      ...(items ?? []).map(
        (i) => `• ${i.quantity}x ${i.product_name}${i.variant_color ? ` (${i.variant_color})` : ""} — ${brl(i.unit_price)}`
      ),
      "",
      `Total: ${brl(order.total)}`,
    ].filter(Boolean);

    return { content: [{ type: "text", text: lines.join("\n") }], structuredContent: { order, items: items ?? [] } };
  },
});
