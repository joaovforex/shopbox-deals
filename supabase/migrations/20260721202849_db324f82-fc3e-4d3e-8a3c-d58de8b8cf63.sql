
CREATE OR REPLACE FUNCTION public.apply_category_discount(pct numeric, categories text[])
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
  IF categories IS NULL OR array_length(categories, 1) IS NULL THEN
    RAISE EXCEPTION 'Selecione ao menos uma categoria';
  END IF;

  UPDATE public.products
     SET original_price = price
   WHERE active = true
     AND price > 0
     AND category = ANY(categories)
     AND (original_price IS NULL OR original_price < price);

  UPDATE public.products
     SET price = ROUND((original_price * (1 - pct / 100.0))::numeric, 2)
   WHERE active = true
     AND category = ANY(categories)
     AND original_price IS NOT NULL
     AND original_price > 0;

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$function$;

CREATE OR REPLACE FUNCTION public.clear_category_discount(categories text[])
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
  IF categories IS NULL OR array_length(categories, 1) IS NULL THEN
    RAISE EXCEPTION 'Selecione ao menos uma categoria';
  END IF;

  UPDATE public.products
     SET price = original_price
   WHERE category = ANY(categories)
     AND original_price IS NOT NULL
     AND original_price > 0
     AND price <> original_price;

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.apply_category_discount(numeric, text[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.clear_category_discount(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_category_discount(numeric, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_category_discount(text[]) TO authenticated;
