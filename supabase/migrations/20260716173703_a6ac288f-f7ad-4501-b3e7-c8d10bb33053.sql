CREATE OR REPLACE FUNCTION public.expire_stale_pending_orders(p_minutes integer DEFAULT 10)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_count int;
BEGIN
  WITH updated AS (
    UPDATE public.orders
       SET status = 'cancelled',
           cancellation_reason = coalesce(cancellation_reason, 'expired')
     WHERE status = 'pending'
       AND (
         -- Pedidos sem sessão de checkout externa: expiram no tempo padrão.
         (cielo_checkout_url IS NULL AND mp_init_point IS NULL
          AND created_at < now() - make_interval(mins => p_minutes))
         OR
         -- Pedidos com checkout Cielo/MP ativos: dão 60min para o cliente pagar
         -- e para o reconcile confirmar antes de cancelar.
         ((cielo_checkout_url IS NOT NULL OR mp_init_point IS NOT NULL)
          AND created_at < now() - interval '60 minutes')
       )
    RETURNING id
  )
  SELECT count(*) INTO v_count FROM updated;
  RETURN v_count;
END;
$function$;