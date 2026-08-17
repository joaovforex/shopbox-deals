REVOKE EXECUTE ON FUNCTION public.user_role_unidade(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fulfillment_scope_unidade(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.order_matches_unidade(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_role_unidade(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fulfillment_scope_unidade(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.order_matches_unidade(uuid, uuid) TO authenticated, service_role;