
-- Adiciona razão explícita de cancelamento para distinguir abandono x falta de estoque x recusa
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cancellation_reason text;

-- expire_stale_pending_orders agora marca o motivo como 'expired'
CREATE OR REPLACE FUNCTION public.expire_stale_pending_orders(p_minutes integer DEFAULT 30)
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

-- confirm_order_paid marca explicitamente 'out_of_stock' ou 'payment_refused' quando cancela
CREATE OR REPLACE FUNCTION public.confirm_order_paid(p_order_id uuid, p_mp_payment_id text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status text;
  v_restored timestamptz;
  v_item record;
  v_updated int;
BEGIN
  SELECT status, stock_restored_at INTO v_status, v_restored
    FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF v_status = 'paid' THEN RETURN 'already_paid'; END IF;
  IF v_status = 'cancelled' THEN RETURN 'already_cancelled'; END IF;

  FOR v_item IN
    SELECT oi.product_id, oi.quantity, oi.product_name
      FROM public.order_items oi
     WHERE oi.order_id = p_order_id
  LOOP
    UPDATE public.products
       SET stock = stock - v_item.quantity
     WHERE id = v_item.product_id
       AND stock >= v_item.quantity;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN
      UPDATE public.orders
         SET status = 'cancelled',
             cancellation_reason = 'out_of_stock',
             mp_payment_id = coalesce(mp_payment_id, p_mp_payment_id),
             stock_restored_at = now()
       WHERE id = p_order_id;
      UPDATE public.products p
         SET stock = stock + oi.quantity
        FROM public.order_items oi
       WHERE oi.order_id = p_order_id
         AND oi.product_id = p.id
         AND oi.product_id <> v_item.product_id;
      RETURN 'out_of_stock';
    END IF;
  END LOOP;

  UPDATE public.orders
     SET status = 'paid',
         mp_payment_id = coalesce(p_mp_payment_id, mp_payment_id),
         stock_restored_at = NULL
   WHERE id = p_order_id;

  RETURN 'ok';
END;
$function$;

-- Backfill: pedidos cancelados existentes sem razão recebem heurística melhor
-- Sem mp_payment_id e sem confirmação = abandono/expiração
UPDATE public.orders
   SET cancellation_reason = 'expired'
 WHERE status = 'cancelled'
   AND cancellation_reason IS NULL
   AND mp_payment_id IS NULL;

-- Com mp_payment_id mas sem motivo = pagamento recusado/estornado pelo MP
UPDATE public.orders
   SET cancellation_reason = 'payment_refused'
 WHERE status = 'cancelled'
   AND cancellation_reason IS NULL
   AND mp_payment_id IS NOT NULL;
