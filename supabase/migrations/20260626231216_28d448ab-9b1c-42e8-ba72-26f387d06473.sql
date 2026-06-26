
CREATE OR REPLACE FUNCTION public.confirm_order_paid(p_order_id uuid, p_mp_payment_id text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status text;
  v_restored timestamptz;
  v_reason text;
  v_item record;
  v_updated int;
BEGIN
  SELECT status, stock_restored_at, cancellation_reason
    INTO v_status, v_restored, v_reason
    FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF v_status = 'paid' THEN RETURN 'already_paid'; END IF;

  -- Cancelado: só revive se foi por expiração automática. Cancelamento manual / reembolso fica como está.
  IF v_status = 'cancelled' AND coalesce(v_reason,'') NOT IN ('expired') THEN
    RETURN 'already_cancelled';
  END IF;

  -- Reservar estoque se necessário (cancelado-expirado já devolveu; pendente legado pode não ter reservado)
  IF v_restored IS NOT NULL OR v_status = 'cancelled' THEN
    FOR v_item IN
      SELECT oi.product_id, oi.quantity, oi.variant_color
        FROM public.order_items oi WHERE oi.order_id = p_order_id
    LOOP
      IF v_item.variant_color IS NOT NULL THEN
        UPDATE public.products p
           SET color_variants = jsonb_set(
                 p.color_variants,
                 ARRAY[public.find_variant_index(p.color_variants, v_item.variant_color)::text, 'stock'],
                 to_jsonb(GREATEST(0, COALESCE((p.color_variants->public.find_variant_index(p.color_variants, v_item.variant_color)->>'stock')::int, 0) - v_item.quantity))
               )
         WHERE p.id = v_item.product_id
           AND public.find_variant_index(p.color_variants, v_item.variant_color) IS NOT NULL
           AND COALESCE((p.color_variants->public.find_variant_index(p.color_variants, v_item.variant_color)->>'stock')::int, 0) >= v_item.quantity;
        GET DIAGNOSTICS v_updated = ROW_COUNT;
      ELSE
        UPDATE public.products SET stock = stock - v_item.quantity
         WHERE id = v_item.product_id AND stock >= v_item.quantity
           AND (color_variants IS NULL OR jsonb_array_length(color_variants) = 0);
        GET DIAGNOSTICS v_updated = ROW_COUNT;
      END IF;

      IF v_updated = 0 THEN
        UPDATE public.orders
           SET status = 'cancelled',
               cancellation_reason = 'out_of_stock',
               mp_payment_id = coalesce(mp_payment_id, p_mp_payment_id),
               stock_restored_at = now()
         WHERE id = p_order_id;
        RETURN 'out_of_stock';
      END IF;
    END LOOP;
  END IF;

  UPDATE public.orders
     SET status = 'paid',
         fulfillment_status = CASE WHEN fulfillment_status IS NULL OR fulfillment_status = '' THEN 'pending' ELSE fulfillment_status END,
         cancellation_reason = NULL,
         mp_payment_id = coalesce(p_mp_payment_id, mp_payment_id),
         stock_restored_at = NULL
   WHERE id = p_order_id;

  RETURN 'ok';
END;
$function$;

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
       AND created_at < now() - make_interval(mins => p_minutes)
    RETURNING id
  )
  SELECT count(*) INTO v_count FROM updated;
  RETURN v_count;
END;
$function$;
