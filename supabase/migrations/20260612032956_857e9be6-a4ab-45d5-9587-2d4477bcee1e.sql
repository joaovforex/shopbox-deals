
-- 1) Remove permissive public-read policies on orders & order_items
DROP POLICY IF EXISTS "Public read by id" ON public.orders;
DROP POLICY IF EXISTS "Public read order items" ON public.order_items;

-- 2) Restrict Supabase Realtime: enable RLS on realtime.messages and allow
-- only admin/fulfillment to subscribe (the only realtime consumer is the
-- expedição screen). RLS may already be on; enabling is idempotent.
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Fulfillment & admin can read realtime" ON realtime.messages;
CREATE POLICY "Fulfillment & admin can read realtime"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role_name(auth.uid(), 'fulfillment')
);

-- 3) Lock SECURITY DEFINER functions to the roles that actually need them.
-- Server-only (called via service_role): create_pending_order, expire_stale_pending_orders, place_order
REVOKE EXECUTE ON FUNCTION public.create_pending_order(text,text,text,text,text,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.create_pending_order(text,text,text,text,text,text,jsonb) TO service_role;

REVOKE EXECUTE ON FUNCTION public.expire_stale_pending_orders(integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.expire_stale_pending_orders(integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.place_order(text,text,text,text,text,jsonb,text,text,text,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.place_order(text,text,text,text,text,jsonb,text,text,text,text,text,text,text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.place_order(text,text,text,text,text,jsonb,text,text,text,text,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.place_order(text,text,text,text,text,jsonb,text,text,text,text,text,text,text,text) TO service_role;

-- Authenticated only (called from the admin/team UI)
REVOKE EXECUTE ON FUNCTION public.assign_team_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.remove_team_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.search_team_candidates(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.claim_first_admin_if_none() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mark_label_event(uuid, text) FROM PUBLIC, anon;

-- has_role / has_role_name are used inside RLS policies, keep executable
-- for authenticated (definer means body still runs with elevated rights).
-- No change needed.
