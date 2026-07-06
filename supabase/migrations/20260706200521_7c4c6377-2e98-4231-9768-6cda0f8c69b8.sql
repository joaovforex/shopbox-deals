
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

CREATE OR REPLACE FUNCTION public.set_fulfillment_status(p_order_id uuid, p_status text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF NOT (
    public.has_role(v_uid, 'admin') OR
    public.has_role(v_uid, 'manager') OR
    public.has_role(v_uid, 'fulfillment') OR
    public.has_role(v_uid, 'catalog')
  ) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  IF p_status NOT IN ('pending','preparing','ready','shipped','completed') THEN
    RAISE EXCEPTION 'Status inválido';
  END IF;
  UPDATE public.orders
     SET fulfillment_status = p_status,
         delivered_at = CASE
           WHEN p_status = 'completed' THEN COALESCE(delivered_at, now())
           ELSE NULL
         END
   WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;
  RETURN 'ok';
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_fulfillment_status(uuid, text) TO authenticated;
