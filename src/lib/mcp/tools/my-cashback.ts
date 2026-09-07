import { defineTool } from "@lovable.dev/mcp-js";
import { brl, notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_my_cashback",
  title: "Meu cashback",
  description: "Mostra o saldo de cashback disponível do usuário conectado.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("cashback_credits")
      .select("amount,used_amount,expires_at,status")
      .eq("user_id", ctx.getUserId());
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    const now = Date.now();
    const available = (data ?? []).reduce((sum, c) => {
      const expired = c.expires_at ? new Date(c.expires_at as string).getTime() < now : false;
      if (expired || (c.status && c.status !== "active")) return sum;
      return sum + (Number(c.amount ?? 0) - Number(c.used_amount ?? 0));
    }, 0);

    return {
      content: [{ type: "text", text: `Saldo de cashback disponível: ${brl(available)}` }],
      structuredContent: { available },
    };
  },
});
