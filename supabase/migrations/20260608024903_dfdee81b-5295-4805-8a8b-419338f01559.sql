ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS label_status text NOT NULL DEFAULT 'not_generated',
  ADD COLUMN IF NOT EXISTS label_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS label_generated_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS label_generated_by_name text,
  ADD COLUMN IF NOT EXISTS label_printed_at timestamptz,
  ADD COLUMN IF NOT EXISTS label_printed_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS label_printed_by_name text;

CREATE OR REPLACE FUNCTION public.mark_label_event(p_order_id uuid, p_event text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_name text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF NOT (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'fulfillment') OR public.has_role(v_uid, 'catalog')) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  SELECT coalesce(nullif(full_name,''), (SELECT email FROM auth.users WHERE id = v_uid))
    INTO v_name FROM public.profiles WHERE id = v_uid;

  IF p_event = 'generated' THEN
    UPDATE public.orders
       SET label_generated_at = coalesce(label_generated_at, now()),
           label_generated_by = coalesce(label_generated_by, v_uid),
           label_generated_by_name = coalesce(label_generated_by_name, v_name),
           label_status = CASE WHEN label_status = 'printed' THEN 'printed' ELSE 'generated' END
     WHERE id = p_order_id;
  ELSIF p_event = 'printed' THEN
    UPDATE public.orders
       SET label_printed_at = now(),
           label_printed_by = v_uid,
           label_printed_by_name = v_name,
           label_status = 'printed',
           label_generated_at = coalesce(label_generated_at, now()),
           label_generated_by = coalesce(label_generated_by, v_uid),
           label_generated_by_name = coalesce(label_generated_by_name, v_name)
     WHERE id = p_order_id;
  ELSE
    RAISE EXCEPTION 'Evento inválido';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_label_event(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_label_event(uuid, text) TO authenticated;