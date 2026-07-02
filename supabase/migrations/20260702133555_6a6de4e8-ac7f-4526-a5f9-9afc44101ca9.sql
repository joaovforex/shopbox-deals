
CREATE TABLE IF NOT EXISTS public.exchange_vouchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE SET NULL,
  user_id UUID NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  reason TEXT NOT NULL,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  customer_name TEXT,
  customer_phone TEXT,
  customer_cpf TEXT,
  customer_email TEXT,
  order_total NUMERIC,
  order_created_at TIMESTAMPTZ,
  operator_id UUID,
  operator_name TEXT,
  cashback_entry_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS exchange_vouchers_order_idx ON public.exchange_vouchers(order_id);
CREATE INDEX IF NOT EXISTS exchange_vouchers_user_idx ON public.exchange_vouchers(user_id);
CREATE INDEX IF NOT EXISTS exchange_vouchers_created_idx ON public.exchange_vouchers(created_at DESC);

GRANT SELECT ON public.exchange_vouchers TO authenticated;
GRANT ALL ON public.exchange_vouchers TO service_role;

ALTER TABLE public.exchange_vouchers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins veem todos os vale-trocas" ON public.exchange_vouchers;
CREATE POLICY "Admins veem todos os vale-trocas" ON public.exchange_vouchers
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Cliente ve proprios vale-trocas" ON public.exchange_vouchers;
CREATE POLICY "Cliente ve proprios vale-trocas" ON public.exchange_vouchers
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- RPC que grava vale-troca + cashback num único passo, atômico.
CREATE OR REPLACE FUNCTION public.create_exchange_voucher(
  p_order_id UUID,
  p_amount NUMERIC,
  p_reason TEXT,
  p_items JSONB,
  p_operator_id UUID,
  p_operator_name TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_entry_id UUID;
  v_voucher_id UUID;
  v_is_admin BOOLEAN;
BEGIN
  IF p_operator_id IS NULL THEN
    RAISE EXCEPTION 'operator_id obrigatorio';
  END IF;
  SELECT public.has_role(p_operator_id, 'admin'::app_role) INTO v_is_admin;
  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'Apenas SUPERADMIN pode emitir vale-troca';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido nao encontrado'; END IF;
  IF v_order.status <> 'paid' THEN RAISE EXCEPTION 'Pedido nao esta pago'; END IF;
  IF v_order.user_id IS NULL THEN
    RAISE EXCEPTION 'Pedido sem cliente cadastrado - nao e possivel gerar vale-troca';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Valor invalido'; END IF;
  IF p_amount > v_order.total + 0.001 THEN
    RAISE EXCEPTION 'Valor maior que o total do pedido';
  END IF;

  INSERT INTO public.cashback_entries (user_id, order_id, kind, amount, expires_at)
  VALUES (v_order.user_id, p_order_id, 'earn', round(p_amount, 2), now() + interval '30 days')
  RETURNING id INTO v_entry_id;

  INSERT INTO public.exchange_vouchers (
    order_id, user_id, amount, reason, items,
    customer_name, customer_phone, customer_cpf, customer_email,
    order_total, order_created_at, operator_id, operator_name, cashback_entry_id
  ) VALUES (
    p_order_id, v_order.user_id, round(p_amount, 2), p_reason, COALESCE(p_items, '[]'::jsonb),
    v_order.customer_name, v_order.customer_phone, v_order.customer_cpf, v_order.customer_email,
    v_order.total, v_order.created_at, p_operator_id, p_operator_name, v_entry_id
  ) RETURNING id INTO v_voucher_id;

  RETURN v_voucher_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_exchange_voucher(UUID, NUMERIC, TEXT, JSONB, UUID, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_exchange_voucher(UUID, NUMERIC, TEXT, JSONB, UUID, TEXT) TO service_role;
