import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { brl, notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_product",
  title: "Detalhes do produto",
  description: "Retorna os detalhes completos de um produto pelo seu id.",
  inputSchema: { id: z.string().uuid().describe("Id do produto.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ id }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("products")
      .select("id,name,description,price,original_price,category,brand,size,stock,sku,image_url,active")
      .eq("id", id)
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data) return { content: [{ type: "text", text: "Produto não encontrado." }], isError: true };

    const text = [
      data.name,
      `Preço: ${brl(data.price)}${data.original_price ? ` (de ${brl(data.original_price)})` : ""}`,
      `Categoria: ${data.category ?? "-"} · Marca: ${data.brand ?? "-"} · Tamanho: ${data.size ?? "-"}`,
      `Estoque: ${data.stock ?? 0} · SKU: ${data.sku ?? "-"}`,
      data.description ? `\n${data.description}` : "",
    ].join("\n");
    return { content: [{ type: "text", text }], structuredContent: { product: data } };
  },
});
