
ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS global_discount_percent numeric NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.apply_global_discount(pct numeric)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  IF pct IS NULL OR pct < 0 OR pct > 90 THEN
    RAISE EXCEPTION 'Percentual inválido (0 a 90)';
  END IF;

  -- 1) Congela preço original para produtos que ainda não têm referência.
  UPDATE public.products
     SET original_price = price
   WHERE is_active = true
     AND price > 0
     AND (original_price IS NULL OR original_price < price);

  -- 2) Aplica o desconto sobre o preço original.
  UPDATE public.products
     SET price = ROUND((original_price * (1 - pct / 100.0))::numeric, 2)
   WHERE is_active = true
     AND original_price IS NOT NULL
     AND original_price > 0;

  GET DIAGNOSTICS affected = ROW_COUNT;

  UPDATE public.site_settings
     SET global_discount_percent = pct,
         updated_at = now()
   WHERE id = 1;

  RETURN affected;
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_global_discount()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  UPDATE public.products
     SET price = original_price,
         original_price = NULL
   WHERE original_price IS NOT NULL
     AND original_price > 0;

  GET DIAGNOSTICS affected = ROW_COUNT;

  UPDATE public.site_settings
     SET global_discount_percent = 0,
         updated_at = now()
   WHERE id = 1;

  RETURN affected;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_global_discount(numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.clear_global_discount() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_global_discount(numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_global_discount() TO authenticated;
