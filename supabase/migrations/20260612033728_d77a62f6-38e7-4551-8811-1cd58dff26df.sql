
-- Trigger functions: never called via API
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.restore_stock_on_cancel() FROM PUBLIC, anon, authenticated;

-- has_role / has_role_name: revoke from anon only (authenticated needs it for RLS policy evaluation)
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role_name(uuid, text) FROM PUBLIC, anon;
