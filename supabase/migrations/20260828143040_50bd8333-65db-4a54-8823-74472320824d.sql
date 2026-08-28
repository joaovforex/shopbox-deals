ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS pickup_person_name text,
  ADD COLUMN IF NOT EXISTS pickup_photo_path text,
  ADD COLUMN IF NOT EXISTS pickup_photo_taken_at timestamptz;

CREATE OR REPLACE FUNCTION public.confirm_order_delivery(
  p_order_id uuid,
  p_delivered_by_name text,
  p_pickup_person_name text,
  p_pickup_photo_path text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_name text := btrim(coalesce(p_delivered_by_name, ''));
  v_person text := btrim(coalesce(p_pickup_person_name, ''));
  v_photo text := nullif(btrim(coalesce(p_pickup_photo_path, '')), '');
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
  IF length(v_person) < 2 THEN
    RAISE EXCEPTION 'Informe o nome do responsável pela retirada';
  END IF;
  IF v_photo IS NULL THEN
    RAISE EXCEPTION 'É obrigatório registrar a foto de quem está retirando';
  END IF;

  UPDATE public.orders
     SET fulfillment_status = 'completed',
         delivered_by_name = v_name,
         pickup_person_name = v_person,
         pickup_photo_path = v_photo,
         pickup_photo_taken_at = now(),
         delivered_at = COALESCE(delivered_at, now())
   WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;
  RETURN 'ok';
END;
$function$;

GRANT EXECUTE ON FUNCTION public.confirm_order_delivery(uuid, text, text, text) TO authenticated;

CREATE POLICY "staff upload pickup proofs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'pickup-proofs' AND (
      public.has_role(auth.uid(), 'admin') OR
      public.has_role(auth.uid(), 'manager') OR
      public.has_role(auth.uid(), 'fulfillment')
    )
  );

CREATE POLICY "staff read pickup proofs"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'pickup-proofs' AND (
      public.has_role(auth.uid(), 'admin') OR
      public.has_role(auth.uid(), 'manager') OR
      public.has_role(auth.uid(), 'fulfillment')
    )
  );