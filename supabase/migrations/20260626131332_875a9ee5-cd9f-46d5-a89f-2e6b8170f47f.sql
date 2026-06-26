
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS mp_init_point text;

CREATE OR REPLACE FUNCTION public.expire_stale_pending_orders(p_minutes integer DEFAULT 5)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count int;
BEGIN
  WITH updated AS (
    UPDATE public.orders
       SET status = 'cancelled',
           cancellation_reason = coalesce(cancellation_reason, 'expired')
     WHERE status = 'pending'
       AND created_at < now() - make_interval(mins => p_minutes)
    RETURNING id
  )
  SELECT count(*) INTO v_count FROM updated;
  RETURN v_count;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.expire_stale_pending_orders(integer) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.expire_stale_pending_orders(integer) TO service_role;

DO $$
BEGIN
  PERFORM cron.unschedule('expire-stale-pending-orders');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'expire-stale-pending-orders',
  '* * * * *',
  $$ SELECT public.expire_stale_pending_orders(5); $$
);
