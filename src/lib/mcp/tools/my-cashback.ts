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
      .from("cashback_entries")
      .select("amount,kind,consumed,expires_at,expired_at")
      .eq("user_id", ctx.getUserId())
      .eq("consumed", false)
      .is("expired_at", null);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    const now = Date.now();
    const available = (data ?? []).reduce((sum, c) => {
      const expired = c.expires_at ? new Date(c.expires_at as string).getTime() < now : false;
      return expired ? sum : sum + Number(c.amount ?? 0);
    }, 0);

    return {
      content: [{ type: "text", text: `Saldo de cashback disponível: ${brl(available)}` }],
      structuredContent: { available },
    };
  },
});
