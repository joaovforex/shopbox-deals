import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Saldo de cashback + próxima expiração do usuário atual.
 */
export const getMyCashback = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Falha de serviço NÃO pode virar "R$ 0,00" na tela: se qualquer uma das
    // duas leituras falhar, propagamos erro genérico e a UI mostra "tentar de
    // novo". O formato de sucesso continua exatamente o mesmo.
    const { data: bal, error: balErr } = await context.supabase.rpc("cashback_balance" as never, {
      p_user_id: context.userId,
    } as never);
    if (balErr) throw new Error("Não foi possível consultar seu cashback agora.");

    const { data: nextRows, error: nextErr } = await context.supabase.rpc("cashback_next_expiry" as never, {
      p_user_id: context.userId,
    } as never);
    if (nextErr) throw new Error("Não foi possível consultar seu cashback agora.");

    const arr = (nextRows as unknown as Array<{ amount: number; expires_at: string }> | null) ?? [];
    const next = arr.length > 0 ? arr[0] : null;
    return {
      balance: Number(bal ?? 0),
      nextExpiry: next ? { amount: Number(next.amount), expiresAt: next.expires_at } : null,
    };
  });


/**
 * Aplica cashback como desconto em um pedido pendente do próprio usuário.
 * Retorna o valor efetivamente aplicado (pode ser menor que o pedido).
 */
export const applyCashback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { orderId: string; amount: number }) => {
    if (!data?.orderId || !/^[0-9a-f-]{36}$/i.test(data.orderId)) throw new Error("Pedido inválido");
    if (!Number.isFinite(data.amount) || data.amount < 0) throw new Error("Valor inválido");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { data: applied, error } = await context.supabase.rpc("apply_cashback_to_order" as never, {
      p_order_id: data.orderId,
      p_amount: data.amount,
    } as never);
    if (error) throw new Error(error.message);
    return { applied: Number(applied ?? 0) };
  });
