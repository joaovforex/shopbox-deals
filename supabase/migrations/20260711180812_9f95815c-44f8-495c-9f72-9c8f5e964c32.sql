
-- 1) Tabela singleton de configurações do site
CREATE TABLE IF NOT EXISTS public.site_settings (
  id smallint PRIMARY KEY DEFAULT 1,
  cashback_rate numeric(5,4) NOT NULL DEFAULT 0.05,
  banner_desktop_url text,
  banner_mobile_url text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT site_settings_singleton CHECK (id = 1),
  CONSTRAINT cashback_rate_range CHECK (cashback_rate >= 0 AND cashback_rate <= 1)
);

GRANT SELECT ON public.site_settings TO anon, authenticated;
GRANT UPDATE, INSERT ON public.site_settings TO authenticated;
GRANT ALL ON public.site_settings TO service_role;

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read site_settings" ON public.site_settings;
CREATE POLICY "public read site_settings"
  ON public.site_settings FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "superadmin update site_settings" ON public.site_settings;
CREATE POLICY "superadmin update site_settings"
  ON public.site_settings FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "superadmin insert site_settings" ON public.site_settings;
CREATE POLICY "superadmin insert site_settings"
  ON public.site_settings FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND id = 1);

-- Semente da linha singleton
INSERT INTO public.site_settings (id, cashback_rate)
VALUES (1, 0.05)
ON CONFLICT (id) DO NOTHING;

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION public.site_settings_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_site_settings_touch ON public.site_settings;
CREATE TRIGGER trg_site_settings_touch
BEFORE UPDATE ON public.site_settings
FOR EACH ROW EXECUTE FUNCTION public.site_settings_touch_updated_at();

-- 2) grant_order_cashback passa a ler a taxa da tabela site_settings
CREATE OR REPLACE FUNCTION public.grant_order_cashback(p_order_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.orders%ROWTYPE;
  v_subtotal numeric;
  v_cashback numeric;
  v_rate numeric;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 0; END IF;
  IF v_order.user_id IS NULL THEN RETURN 0; END IF;
  IF v_order.status <> 'paid' THEN RETURN 0; END IF;
  IF v_order.cashback_granted_at IS NOT NULL THEN RETURN v_order.cashback_earned; END IF;

  SELECT cashback_rate INTO v_rate FROM public.site_settings WHERE id = 1;
  v_rate := COALESCE(v_rate, 0.05);

  SELECT COALESCE(SUM(unit_price * quantity), 0) INTO v_subtotal
    FROM public.order_items WHERE order_id = p_order_id;
  v_subtotal := v_subtotal - COALESCE(v_order.cashback_used, 0);
  IF v_subtotal <= 0 THEN
    UPDATE public.orders SET cashback_granted_at = now(), cashback_earned = 0 WHERE id = p_order_id;
    RETURN 0;
  END IF;
  v_cashback := round(v_subtotal * v_rate, 2);

  INSERT INTO public.cashback_entries (user_id, order_id, kind, amount, expires_at)
  VALUES (v_order.user_id, p_order_id, 'earn', v_cashback, now() + interval '30 days');

  UPDATE public.orders
     SET cashback_earned = v_cashback, cashback_granted_at = now()
   WHERE id = p_order_id;

  RETURN v_cashback;
END;
$function$;
