
-- Admin/team functions: revoke from anon (still accessible to authenticated; internal has_role checks enforce role)
REVOKE EXECUTE ON FUNCTION public.assign_team_role(uuid, public.app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.remove_team_role(uuid, public.app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.search_team_candidates(text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_search_team_candidates(text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.mark_label_event(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.set_fulfillment_status(uuid, text) FROM anon, public;

-- System/maintenance functions: revoke from anon and authenticated (only service_role / webhooks / cron should call)
REVOKE EXECUTE ON FUNCTION public.expire_stale_pending_orders(integer) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.expire_cart_reservations() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.confirm_order_paid(uuid, text) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.claim_first_admin_for_user(uuid) FROM anon, authenticated, public;

-- Ensure service_role retains access for backend usage
GRANT EXECUTE ON FUNCTION public.assign_team_role(uuid, public.app_role) TO service_role;
GRANT EXECUTE ON FUNCTION public.remove_team_role(uuid, public.app_role) TO service_role;
GRANT EXECUTE ON FUNCTION public.search_team_candidates(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_search_team_candidates(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_label_event(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_fulfillment_status(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_stale_pending_orders(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_cart_reservations() TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_order_paid(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_first_admin_for_user(uuid) TO service_role;
