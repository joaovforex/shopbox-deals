
-- Colunas de snapshot: capturam o preço/original no momento da 1ª aplicação
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS mass_discount_snapshot_price numeric,
  ADD COLUMN IF NOT EXISTS mass_discount_snapshot_original numeric;

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

  -- 1) Snapshot na primeira aplicação (preserva De/Por manual)
  UPDATE public.products
     SET mass_discount_snapshot_price = price,
         mass_discount_snapshot_original = original_price
   WHERE active = true
     AND price > 0
     AND mass_discount_snapshot_price IS NULL;

  -- 2) Garante que original_price exista para exibir De/Por no site
  UPDATE public.products
     SET original_price = mass_discount_snapshot_price
   WHERE active = true
     AND mass_discount_snapshot_price IS NOT NULL
     AND original_price IS NULL;

  -- 3) Aplica desconto SEMPRE em cima do preço-base congelado (nunca sobre o "De")
  UPDATE public.products
     SET price = ROUND((mass_discount_snapshot_price * (1 - pct / 100.0))::numeric, 2)
   WHERE active = true
     AND mass_discount_snapshot_price IS NOT NULL
     AND mass_discount_snapshot_price > 0;

  GET DIAGNOSTICS affected = ROW_COUNT;

  UPDATE public.site_settings
     SET global_discount_percent = pct,
         updated_at = now()
   WHERE id = 1;

  RETURN affected;
END;
$function$;

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
     SET mass_discount_snapshot_price = price,
         mass_discount_snapshot_original = original_price
   WHERE active = true
     AND price > 0
     AND category = ANY(categories)
     AND mass_discount_snapshot_price IS NULL;

  UPDATE public.products
     SET original_price = mass_discount_snapshot_price
   WHERE active = true
     AND category = ANY(categories)
     AND mass_discount_snapshot_price IS NOT NULL
     AND original_price IS NULL;

  UPDATE public.products
     SET price = ROUND((mass_discount_snapshot_price * (1 - pct / 100.0))::numeric, 2)
   WHERE active = true
     AND category = ANY(categories)
     AND mass_discount_snapshot_price IS NOT NULL
     AND mass_discount_snapshot_price > 0;

  GET DIAGNOSTICS affected = ROW_COUNT;
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

  -- Restaura EXATAMENTE o estado anterior à aplicação
  UPDATE public.products
     SET price = mass_discount_snapshot_price,
         original_price = mass_discount_snapshot_original,
         mass_discount_snapshot_price = NULL,
         mass_discount_snapshot_original = NULL
   WHERE mass_discount_snapshot_price IS NOT NULL;

  GET DIAGNOSTICS affected = ROW_COUNT;

  UPDATE public.site_settings
     SET global_discount_percent = 0,
         updated_at = now()
   WHERE id = 1;

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
     SET price = mass_discount_snapshot_price,
         original_price = mass_discount_snapshot_original,
         mass_discount_snapshot_price = NULL,
         mass_discount_snapshot_original = NULL
   WHERE category = ANY(categories)
     AND mass_discount_snapshot_price IS NOT NULL;

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$function$;
