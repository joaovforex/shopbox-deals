
CREATE OR REPLACE FUNCTION public.confirm_order_delivery(p_order_id uuid, p_delivered_by_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_name text := btrim(coalesce(p_delivered_by_name, ''));
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF NOT (
    public.has_role(v_uid, 'admin') OR
    public.has_role(v_uid, 'manager') OR
    public.has_role(v_uid, 'fulfillment')
  ) THEN
    RAISE EXCEPTION 'Sem permissão para confirmar entrega';
  END IF;
  IF length(v_name) < 2 THEN
    RAISE EXCEPTION 'Informe o nome do agente que fez a entrega';
  END IF;
  UPDATE public.orders
     SET fulfillment_status = 'completed',
         delivered_by_name = v_name,
         delivered_at = COALESCE(delivered_at, now())
   WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;
  RETURN 'ok';
END;
$function$;

REVOKE ALL ON FUNCTION public.confirm_order_delivery(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_order_delivery(uuid, text) TO authenticated;
