-- Restaurar EXECUTE em apply_cashback_to_order para o role authenticated.
-- A migração 20260713020427 revogou este acesso, mas a função é chamada
-- pelo checkout via context.supabase (JWT do usuário → role authenticated).
-- Sem este GRANT o checkout falha quando o cliente usa cashback.
GRANT EXECUTE ON FUNCTION public.apply_cashback_to_order(uuid, numeric) TO authenticated;