
-- 1) Revoke EXECUTE on destructive/privileged SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.expire_stale_pending_orders(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.confirm_order_paid(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_first_admin_for_user(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_search_team_candidates(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.restore_stock_on_cancel() FROM PUBLIC, anon, authenticated;

-- 2) site_visits: drop the overly permissive INSERT policy.
--    Visits are inserted exclusively through the SECURITY DEFINER RPC `record_visit`,
--    so direct client INSERTs are unnecessary.
DROP POLICY IF EXISTS "anyone can record a visit" ON public.site_visits;

-- Allow only admins to read aggregated visit data.
DROP POLICY IF EXISTS "admins can read visits" ON public.site_visits;
CREATE POLICY "admins can read visits"
  ON public.site_visits
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
