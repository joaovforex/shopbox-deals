-- Hardens orders/order_items: revokes direct INSERT/UPDATE/DELETE from
-- authenticated and anon roles. All writes must flow through the
-- SECURITY DEFINER RPCs (create_pending_order, place_order, confirm_order_paid, etc.),
-- which validate input, check stock, and enforce ownership.
-- SELECT is left untouched (RLS policies control read access).

REVOKE INSERT, UPDATE, DELETE ON public.orders FROM anon, authenticated, PUBLIC;
REVOKE INSERT, UPDATE, DELETE ON public.order_items FROM anon, authenticated, PUBLIC;

-- service_role keeps full access for edge functions / admin code.
GRANT ALL ON public.orders TO service_role;
GRANT ALL ON public.order_items TO service_role;