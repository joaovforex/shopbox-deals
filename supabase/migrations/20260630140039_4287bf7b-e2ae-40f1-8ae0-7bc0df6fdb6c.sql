CREATE OR REPLACE FUNCTION public.grant_order_cashback(p_order_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.orders%ROWTYPE;
  v_subtotal numeric;
  v_cashback numeric;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 0; END IF;
  IF v_order.user_id IS NULL THEN RETURN 0; END IF;
  IF v_order.status <> 'paid' THEN RETURN 0; END IF;
  IF v_order.cashback_granted_at IS NOT NULL THEN RETURN v_order.cashback_earned; END IF;

  -- 5% do subtotal dos produtos (sem frete, sem o cashback já usado)
  SELECT COALESCE(SUM(unit_price * quantity), 0) INTO v_subtotal
    FROM public.order_items WHERE order_id = p_order_id;
  v_subtotal := v_subtotal - COALESCE(v_order.cashback_used, 0);
  IF v_subtotal <= 0 THEN
    UPDATE public.orders SET cashback_granted_at = now(), cashback_earned = 0 WHERE id = p_order_id;
    RETURN 0;
  END IF;
  v_cashback := round(v_subtotal * 0.05, 2);

  INSERT INTO public.cashback_entries (user_id, order_id, kind, amount, expires_at)
  VALUES (v_order.user_id, p_order_id, 'earn', v_cashback, now() + interval '30 days');

  UPDATE public.orders
     SET cashback_earned = v_cashback, cashback_granted_at = now()
   WHERE id = p_order_id;

  RETURN v_cashback;
END;
$function$;