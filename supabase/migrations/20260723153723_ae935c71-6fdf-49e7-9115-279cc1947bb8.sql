
ALTER TABLE public.exchange_vouchers
  ADD COLUMN IF NOT EXISTS extra_amount numeric NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.create_exchange_voucher(
  p_order_id uuid,
  p_amount numeric,
  p_reason text,
  p_items jsonb,
  p_operator_id uuid,
  p_operator_name text,
  p_extra_amount numeric DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_order public.orders%ROWTYPE;
  v_entry_id UUID;
  v_voucher_id UUID;
  v_is_admin BOOLEAN;
  v_extra numeric := COALESCE(p_extra_amount, 0);
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
  IF v_extra < 0 THEN RAISE EXCEPTION 'Valor adicional invalido'; END IF;
  -- amount total pode superar o total do pedido apenas pelo bônus autorizado
  IF p_amount > v_order.total + v_extra + 0.001 THEN
    RAISE EXCEPTION 'Valor maior que o total do pedido + bonus autorizado';
  END IF;

  INSERT INTO public.cashback_entries (user_id, order_id, kind, amount, expires_at)
  VALUES (v_order.user_id, p_order_id, 'earn', round(p_amount, 2), now() + interval '30 days')
  RETURNING id INTO v_entry_id;

  INSERT INTO public.exchange_vouchers (
    order_id, user_id, amount, extra_amount, reason, items,
    customer_name, customer_phone, customer_cpf, customer_email,
    order_total, order_created_at, operator_id, operator_name, cashback_entry_id
  ) VALUES (
    p_order_id, v_order.user_id, round(p_amount, 2), round(v_extra, 2), p_reason, COALESCE(p_items, '[]'::jsonb),
    v_order.customer_name, v_order.customer_phone, v_order.customer_cpf, v_order.customer_email,
    v_order.total, v_order.created_at, p_operator_id, p_operator_name, v_entry_id
  ) RETURNING id INTO v_voucher_id;

  RETURN v_voucher_id;
END;
$function$;
