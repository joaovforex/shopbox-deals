
CREATE TABLE public.delivery_upgrades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  fee numeric NOT NULL DEFAULT 10,
  status text NOT NULL DEFAULT 'pending',
  shipping_zip text NOT NULL,
  shipping_street text NOT NULL,
  shipping_number text NOT NULL,
  shipping_complement text,
  shipping_district text,
  shipping_city text NOT NULL,
  shipping_state text NOT NULL,
  shipping_recipient_name text,
  shipping_recipient_phone text,
  mp_preference_id text,
  mp_init_point text,
  mp_payment_id text,
  mp_status text,
  paid_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_upgrades_status_chk CHECK (status IN ('pending','paid','cancelled','expired'))
);

CREATE INDEX delivery_upgrades_order_id_idx ON public.delivery_upgrades(order_id);
CREATE INDEX delivery_upgrades_user_id_idx ON public.delivery_upgrades(user_id);
CREATE UNIQUE INDEX delivery_upgrades_one_pending_per_order
  ON public.delivery_upgrades(order_id) WHERE status = 'pending';

GRANT SELECT, INSERT, UPDATE ON public.delivery_upgrades TO authenticated;
GRANT ALL ON public.delivery_upgrades TO service_role;

ALTER TABLE public.delivery_upgrades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own delivery upgrades"
  ON public.delivery_upgrades FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER delivery_upgrades_touch_updated_at
  BEFORE UPDATE ON public.delivery_upgrades
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.apply_delivery_upgrade(
  p_upgrade_id uuid,
  p_mp_payment_id text
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_upg public.delivery_upgrades%ROWTYPE;
BEGIN
  SELECT * INTO v_upg FROM public.delivery_upgrades WHERE id = p_upgrade_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF v_upg.status = 'paid' THEN RETURN 'already_paid'; END IF;
  IF v_upg.status <> 'pending' THEN RETURN 'not_pending'; END IF;

  UPDATE public.orders
  SET delivery_method = 'delivery',
      shipping_zip = v_upg.shipping_zip,
      shipping_street = v_upg.shipping_street,
      shipping_number = v_upg.shipping_number,
      shipping_complement = v_upg.shipping_complement,
      shipping_district = v_upg.shipping_district,
      shipping_city = v_upg.shipping_city,
      shipping_state = v_upg.shipping_state,
      shipping_recipient_name = COALESCE(v_upg.shipping_recipient_name, shipping_recipient_name, customer_name),
      shipping_recipient_phone = COALESCE(v_upg.shipping_recipient_phone, shipping_recipient_phone, customer_phone),
      shipping_address = v_upg.shipping_street || ', ' || v_upg.shipping_number
        || CASE WHEN v_upg.shipping_complement IS NOT NULL AND v_upg.shipping_complement <> '' THEN ' - ' || v_upg.shipping_complement ELSE '' END
        || ', ' || COALESCE(v_upg.shipping_district,'') || ' - ' || v_upg.shipping_city || '/' || v_upg.shipping_state || ' - ' || v_upg.shipping_zip,
      delivery_fee = COALESCE(delivery_fee,0) + v_upg.fee,
      total = COALESCE(total,0) + v_upg.fee,
      updated_at = now()
  WHERE id = v_upg.order_id;

  UPDATE public.delivery_upgrades
  SET status = 'paid', mp_payment_id = p_mp_payment_id, paid_at = now(), updated_at = now()
  WHERE id = p_upgrade_id;

  RETURN 'ok';
END;
$$;

REVOKE ALL ON FUNCTION public.apply_delivery_upgrade(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_delivery_upgrade(uuid, text) TO service_role;
