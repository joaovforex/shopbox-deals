CREATE OR REPLACE FUNCTION public.admin_grant_cashback(
  p_user_id uuid,
  p_amount numeric,
  p_reason text,
  p_days integer DEFAULT 30
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_entry_id uuid;
  v_days integer := COALESCE(p_days, 30);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;
  IF NOT public.has_role(v_uid, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Apenas SUPERADMIN pode conceder cashback';
  END IF;
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'Cliente invalido'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'Cliente nao encontrado';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Valor invalido'; END IF;
  IF p_amount > 5000 THEN RAISE EXCEPTION 'Valor acima do limite permitido (R$ 5.000)'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'Informe o motivo (min. 5 caracteres)';
  END IF;
  IF v_days < 1 OR v_days > 365 THEN RAISE EXCEPTION 'Validade invalida (1 a 365 dias)'; END IF;

  INSERT INTO public.cashback_entries (user_id, order_id, kind, amount, expires_at)
  VALUES (p_user_id, NULL, 'earn', round(p_amount, 2), now() + (v_days || ' days')::interval)
  RETURNING id INTO v_entry_id;

  PERFORM public.log_admin_action(
    'grant_cashback',
    'cashback_entries',
    v_entry_id::text,
    jsonb_build_object('user_id', p_user_id, 'amount', round(p_amount, 2), 'reason', btrim(p_reason), 'days', v_days)
  );

  RETURN v_entry_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_grant_cashback(uuid, numeric, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_grant_cashback(uuid, numeric, text, integer) TO authenticated;