import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { brl, notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_my_orders",
  title: "Meus pedidos",
  description: "Lista os pedidos do usuário conectado, do mais recente para o mais antigo.",
  inputSchema: {
    limit: z.number().int().min(1).max(50).optional().describe("Quantidade máxima de pedidos (padrão 10)."),
    status: z.string().trim().optional().describe("Filtra por status do pagamento (ex.: paid, pending, cancelled)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit, status }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    let q = supabase
      .from("orders")
      .select("id,created_at,status,fulfillment_status,total,delivery_fee,delivery_method,payment_method")
      .order("created_at", { ascending: false })
      .limit(limit ?? 10);
    if (status) q = q.eq("status", status);

    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data?.length) return { content: [{ type: "text", text: "Nenhum pedido encontrado." }] };

    const text = data
      .map((o) => {
        const date = new Date(o.created_at as string).toLocaleDateString("pt-BR");
        return `• #${String(o.id).slice(0, 8).toUpperCase()} — ${date} · ${brl(o.total)} · pagamento ${o.status} · etapa ${o.fulfillment_status ?? "-"}`;
      })
      .join("\n");
    return { content: [{ type: "text", text }], structuredContent: { orders: data } };
  },
});
