
CREATE OR REPLACE FUNCTION public.apply_global_discount(pct numeric)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  affected integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  IF pct IS NULL OR pct < 0 OR pct > 90 THEN
    RAISE EXCEPTION 'Percentual inválido (0 a 90)';
  END IF;

  UPDATE public.products
     SET original_price = price
   WHERE active = true
     AND price > 0
     AND (original_price IS NULL OR original_price < price);

  UPDATE public.products
     SET price = ROUND((original_price * (1 - pct / 100.0))::numeric, 2)
   WHERE active = true
     AND original_price IS NOT NULL
     AND original_price > 0;

  GET DIAGNOSTICS affected = ROW_COUNT;

  UPDATE public.site_settings
     SET global_discount_percent = pct,
         updated_at = now()
   WHERE id = 1;

  RETURN affected;
END;
$function$;

CREATE OR REPLACE FUNCTION public.clear_global_discount()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  affected integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  UPDATE public.products
     SET price = original_price
   WHERE original_price IS NOT NULL
     AND original_price > 0
     AND price <> original_price;

  GET DIAGNOSTICS affected = ROW_COUNT;

  UPDATE public.site_settings
     SET global_discount_percent = 0,
         updated_at = now()
   WHERE id = 1;

  RETURN affected;
END;
$function$;
