
-- Blindagem: revogar EXECUTE de anon (e authenticated onde faz sentido)
-- em funções sensíveis. Todas essas funções continuam funcionando via
-- service_role (webhooks/cron/admin) ou via server functions autenticadas
-- que usam supabaseAdmin.

-- Financeiro / cashback / vouchers — nunca chamados diretamente pelo cliente
REVOKE EXECUTE ON FUNCTION public.apply_cashback_to_order(uuid, numeric) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_exchange_voucher(uuid, numeric, text, jsonb, uuid, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refund_cashback_for_order(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.grant_order_cashback(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_cashback() FROM anon, authenticated;

-- Saldo/expiração de cashback: exigir sessão. RLS já filtra os dados.
REVOKE EXECUTE ON FUNCTION public.cashback_balance(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.cashback_next_expiry(uuid) FROM anon;

-- Fila de e-mails — só service_role usa
REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_queue_wake() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM anon, authenticated;

-- Reservas de carrinho e visitas continuam abertas (usuário anônimo precisa).
-- list_products_paged / list_used_categories / record_visit permanecem públicos.
