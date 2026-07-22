CREATE OR REPLACE FUNCTION public.revert_fulfillment_to_preparing(p_order_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'Somente Super Admin pode reverter pedidos';
  END IF;
  UPDATE public.orders
     SET fulfillment_status = 'preparing',
         delivered_at = NULL,
         delivered_by_name = NULL
   WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;
  RETURN 'ok';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.revert_fulfillment_to_preparing(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.revert_fulfillment_to_preparing(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revert_fulfillment_to_preparing(uuid) TO service_role;