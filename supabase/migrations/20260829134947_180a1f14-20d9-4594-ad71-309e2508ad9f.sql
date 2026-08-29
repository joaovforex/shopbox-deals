CREATE OR REPLACE FUNCTION public.expire_stale_pending_orders(p_minutes integer DEFAULT 5)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count int;
BEGIN
  WITH updated AS (
    UPDATE public.orders
       SET status = 'cancelled',
           cancellation_reason = coalesce(cancellation_reason, 'expired')
     WHERE status = 'pending'
       AND created_at < now() - make_interval(mins => greatest(coalesce(p_minutes, 5), 1))
    RETURNING id
  )
  SELECT count(*) INTO v_count FROM updated;
  RETURN v_count;
END;
$$;

SELECT cron.alter_job(
  29,
  command => $cmd$
  SELECT public.expire_cart_reservations();
  SELECT public.expire_stale_pending_orders(5);
  $cmd$
);