CREATE OR REPLACE FUNCTION public.expire_stale_pending_orders(p_minutes integer DEFAULT 30)
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
       AND (
         (cielo_checkout_url IS NULL AND mp_init_point IS NULL AND asaas_invoice_url IS NULL
          AND created_at < now() - make_interval(mins => p_minutes))
         OR
         ((cielo_checkout_url IS NOT NULL OR mp_init_point IS NOT NULL OR asaas_invoice_url IS NOT NULL)
          AND created_at < now() - interval '30 minutes')
       )
    RETURNING id
  )
  SELECT count(*) INTO v_count FROM updated;
  RETURN v_count;
END;
$$;