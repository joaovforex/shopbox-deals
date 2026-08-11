CREATE OR REPLACE FUNCTION public.refund_cashback_for_order(p_order_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_total numeric;
  v_remaining numeric;
  v_entry record;
  v_give numeric;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 0; END IF;
  v_total := COALESCE(v_order.cashback_used, 0);
  IF v_total <= 0 THEN RETURN 0; END IF;
  v_remaining := v_total;

  -- 1) Devolve primeiro nas entries ainda VALIDAS (nao expiradas).
  FOR v_entry IN
    SELECT e.id, e.consumed
      FROM public.cashback_entries e
     WHERE e.user_id = v_order.user_id AND e.kind = 'earn'
       AND e.consumed > 0
       AND e.expired_at IS NULL
       AND (e.expires_at IS NULL OR e.expires_at > now())
     ORDER BY e.expires_at DESC NULLS FIRST
     FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_give := LEAST(v_remaining, v_entry.consumed);
    UPDATE public.cashback_entries SET consumed = consumed - v_give WHERE id = v_entry.id;
    v_remaining := v_remaining - v_give;
  END LOOP;

  -- 2) O que sobrou vinha de saldo ja expirado: reemite como novo credito
  --    valido por 30 dias (compra nao aprovada nao pode consumir cashback).
  IF v_remaining > 0 AND v_order.user_id IS NOT NULL THEN
    INSERT INTO public.cashback_entries (user_id, order_id, kind, amount, expires_at)
    VALUES (v_order.user_id, p_order_id, 'earn', v_remaining, now() + interval '30 days');
    v_remaining := 0;
  END IF;

  INSERT INTO public.cashback_entries (user_id, order_id, kind, amount)
  VALUES (v_order.user_id, p_order_id, 'refund', v_total - v_remaining);

  UPDATE public.orders SET cashback_used = 0 WHERE id = p_order_id;
  RETURN v_total - v_remaining;
END;
$$;