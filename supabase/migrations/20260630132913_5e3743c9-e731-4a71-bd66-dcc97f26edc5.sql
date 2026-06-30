
-- 1) Tabela de histórico de cashback
CREATE TABLE IF NOT EXISTS public.cashback_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('earn','spend','expire','refund')),
  amount numeric(10,2) NOT NULL CHECK (amount >= 0),
  consumed numeric(10,2) NOT NULL DEFAULT 0 CHECK (consumed >= 0),
  expires_at timestamptz,
  expired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cashback_entries_user_idx ON public.cashback_entries(user_id);
CREATE INDEX IF NOT EXISTS cashback_entries_user_active_idx
  ON public.cashback_entries(user_id, expires_at)
  WHERE kind = 'earn' AND expired_at IS NULL;
CREATE INDEX IF NOT EXISTS cashback_entries_order_idx ON public.cashback_entries(order_id);

GRANT SELECT ON public.cashback_entries TO authenticated;
GRANT ALL ON public.cashback_entries TO service_role;

ALTER TABLE public.cashback_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuario ve proprio cashback" ON public.cashback_entries;
CREATE POLICY "Usuario ve proprio cashback" ON public.cashback_entries
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- 2) Colunas no pedido
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS cashback_earned numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cashback_used numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cashback_granted_at timestamptz;

-- 3) Saldo de cashback
CREATE OR REPLACE FUNCTION public.cashback_balance(p_user_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(amount - consumed), 0)::numeric(10,2)
    FROM public.cashback_entries
   WHERE user_id = p_user_id
     AND kind = 'earn'
     AND expired_at IS NULL
     AND (expires_at IS NULL OR expires_at > now())
     AND amount > consumed;
$$;

-- 4) Próxima expiração (qual valor vence primeiro)
CREATE OR REPLACE FUNCTION public.cashback_next_expiry(p_user_id uuid)
RETURNS TABLE(amount numeric, expires_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (e.amount - e.consumed)::numeric(10,2), e.expires_at
    FROM public.cashback_entries e
   WHERE e.user_id = p_user_id
     AND e.kind = 'earn'
     AND e.expired_at IS NULL
     AND e.expires_at IS NOT NULL
     AND e.expires_at > now()
     AND e.amount > e.consumed
   ORDER BY e.expires_at ASC
   LIMIT 1;
$$;

-- 5) Conceder cashback (chamada quando pedido vira paid)
CREATE OR REPLACE FUNCTION public.grant_order_cashback(p_order_id uuid)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

  -- 10% do subtotal dos produtos (sem frete, sem o cashback já usado)
  SELECT COALESCE(SUM(unit_price * quantity), 0) INTO v_subtotal
    FROM public.order_items WHERE order_id = p_order_id;
  v_subtotal := v_subtotal - COALESCE(v_order.cashback_used, 0);
  IF v_subtotal <= 0 THEN
    UPDATE public.orders SET cashback_granted_at = now(), cashback_earned = 0 WHERE id = p_order_id;
    RETURN 0;
  END IF;
  v_cashback := round(v_subtotal * 0.10, 2);

  INSERT INTO public.cashback_entries (user_id, order_id, kind, amount, expires_at)
  VALUES (v_order.user_id, p_order_id, 'earn', v_cashback, now() + interval '30 days');

  UPDATE public.orders
     SET cashback_earned = v_cashback, cashback_granted_at = now()
   WHERE id = p_order_id;

  RETURN v_cashback;
END;
$$;

-- 6) Aplicar cashback como desconto (FIFO). Chamada apenas para o dono do pedido pendente.
CREATE OR REPLACE FUNCTION public.apply_cashback_to_order(p_order_id uuid, p_amount numeric)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_order public.orders%ROWTYPE;
  v_balance numeric;
  v_remaining numeric;
  v_subtotal numeric;
  v_entry record;
  v_take numeric;
  v_prev_used numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF p_amount IS NULL OR p_amount < 0 THEN RAISE EXCEPTION 'Valor inválido'; END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;
  IF v_order.user_id <> v_uid THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  IF v_order.status <> 'pending' THEN RAISE EXCEPTION 'Pedido não está pendente'; END IF;

  -- Devolve qualquer cashback já aplicado antes (para recalcular)
  v_prev_used := COALESCE(v_order.cashback_used, 0);
  IF v_prev_used > 0 THEN
    PERFORM public.refund_cashback_for_order(p_order_id);
  END IF;

  -- Limita ao subtotal (não pode zerar o pedido a ponto de ficar negativo)
  SELECT COALESCE(SUM(unit_price * quantity), 0) INTO v_subtotal
    FROM public.order_items WHERE order_id = p_order_id;
  IF p_amount > v_subtotal THEN p_amount := v_subtotal; END IF;

  v_balance := public.cashback_balance(v_uid);
  IF p_amount > v_balance THEN p_amount := v_balance; END IF;
  IF p_amount <= 0 THEN
    UPDATE public.orders SET cashback_used = 0, total = v_subtotal + COALESCE(delivery_fee,0) WHERE id = p_order_id;
    RETURN 0;
  END IF;

  v_remaining := p_amount;
  FOR v_entry IN
    SELECT id, amount, consumed
      FROM public.cashback_entries
     WHERE user_id = v_uid AND kind = 'earn' AND expired_at IS NULL
       AND (expires_at IS NULL OR expires_at > now())
       AND amount > consumed
     ORDER BY expires_at ASC NULLS LAST
     FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_take := LEAST(v_remaining, v_entry.amount - v_entry.consumed);
    UPDATE public.cashback_entries SET consumed = consumed + v_take WHERE id = v_entry.id;
    v_remaining := v_remaining - v_take;
  END LOOP;

  INSERT INTO public.cashback_entries (user_id, order_id, kind, amount)
  VALUES (v_uid, p_order_id, 'spend', p_amount);

  UPDATE public.orders
     SET cashback_used = p_amount,
         total = GREATEST(0, v_subtotal - p_amount) + COALESCE(delivery_fee, 0)
   WHERE id = p_order_id;

  RETURN p_amount;
END;
$$;

-- 7) Devolver cashback usado (cancelamento/recálculo)
CREATE OR REPLACE FUNCTION public.refund_cashback_for_order(p_order_id uuid)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_remaining numeric;
  v_entry record;
  v_give numeric;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 0; END IF;
  v_remaining := COALESCE(v_order.cashback_used, 0);
  IF v_remaining <= 0 THEN RETURN 0; END IF;

  -- Devolve nas entries 'earn' deste pedido (LIFO entre as 'spend' deste pedido)
  FOR v_entry IN
    SELECT e.id, e.amount, e.consumed
      FROM public.cashback_entries e
     WHERE e.user_id = v_order.user_id AND e.kind = 'earn'
       AND e.consumed > 0
     ORDER BY e.expires_at DESC NULLS FIRST
     FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_give := LEAST(v_remaining, v_entry.consumed);
    UPDATE public.cashback_entries SET consumed = consumed - v_give WHERE id = v_entry.id;
    v_remaining := v_remaining - v_give;
  END LOOP;

  INSERT INTO public.cashback_entries (user_id, order_id, kind, amount)
  VALUES (v_order.user_id, p_order_id, 'refund', COALESCE(v_order.cashback_used,0) - v_remaining);

  UPDATE public.orders SET cashback_used = 0 WHERE id = p_order_id;
  RETURN COALESCE(v_order.cashback_used,0) - v_remaining;
END;
$$;

-- 8) Expirar cashback vencido (cron)
CREATE OR REPLACE FUNCTION public.expire_cashback()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int;
BEGIN
  WITH upd AS (
    UPDATE public.cashback_entries
       SET expired_at = now()
     WHERE kind = 'earn'
       AND expired_at IS NULL
       AND expires_at IS NOT NULL
       AND expires_at <= now()
       AND amount > consumed
     RETURNING id, user_id, (amount - consumed) AS leftover, order_id
  )
  INSERT INTO public.cashback_entries (user_id, order_id, kind, amount)
  SELECT user_id, order_id, 'expire', leftover FROM upd WHERE leftover > 0;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- 9) Trigger: ao virar 'paid', conceder cashback; ao virar 'cancelled', devolver usado
CREATE OR REPLACE FUNCTION public.orders_cashback_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'paid' AND (OLD.status IS DISTINCT FROM 'paid') AND NEW.cashback_granted_at IS NULL THEN
    PERFORM public.grant_order_cashback(NEW.id);
  ELSIF NEW.status = 'cancelled' AND (OLD.status IS DISTINCT FROM 'cancelled') AND COALESCE(NEW.cashback_used,0) > 0 THEN
    PERFORM public.refund_cashback_for_order(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_cashback ON public.orders;
CREATE TRIGGER trg_orders_cashback
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_cashback_trigger();

REVOKE EXECUTE ON FUNCTION public.grant_order_cashback(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refund_cashback_for_order(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_cashback() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cashback_balance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cashback_next_expiry(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_cashback_to_order(uuid, numeric) TO authenticated;
