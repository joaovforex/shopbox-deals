import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { brl, notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "search_products",
  title: "Buscar produtos",
  description: "Busca produtos ativos no catálogo da shopbox por texto e/ou categoria.",
  inputSchema: {
    query: z.string().trim().optional().describe("Texto de busca (nome do produto, marca ou SKU)."),
    category: z.string().trim().optional().describe("Filtra por categoria exata."),
    limit: z.number().int().min(1).max(50).optional().describe("Quantidade máxima de resultados (padrão 10)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, category, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    let q = supabase
      .from("products")
      .select("id,name,price,original_price,category,brand,stock,sku,image_url")
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(limit ?? 10);
    if (category) q = q.eq("category", category);
    if (query) q = q.or(`name.ilike.%${query}%,brand.ilike.%${query}%,sku.ilike.%${query}%`);

    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data?.length) return { content: [{ type: "text", text: "Nenhum produto encontrado." }] };

    const text = data
      .map((p) => `• ${p.name} — ${brl(p.price)} · estoque ${p.stock ?? 0} · ${p.category ?? "sem categoria"} (id ${p.id})`)
      .join("\n");
    return { content: [{ type: "text", text }], structuredContent: { products: data } };
  },
});
