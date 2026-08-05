-- ============ TAREFA 1: jobs Cielo lendo o segredo de app_secrets + rotação ============
SELECT cron.schedule(
  'reconcile-cielo-orders',
  '*/10 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://shopbox-share-and-sell.lovable.app/api/public/cielo/reconcile',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT value FROM public.app_secrets WHERE name = 'cron_secret')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $cron$
);

SELECT cron.schedule(
  'cielo-refund-retry',
  '17 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://shopbox-share-and-sell.lovable.app/api/public/hooks/cielo-refund-retry',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT value FROM public.app_secrets WHERE name = 'cron_secret')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $cron$
);

UPDATE public.app_secrets
   SET value = replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-',''),
       updated_at = now()
 WHERE name = 'cron_secret';

-- ============ TAREFA 2: log de auditoria ============
CREATE OR REPLACE FUNCTION public.log_admin_action(
  p_action text,
  p_entity text,
  p_entity_id text DEFAULT NULL,
  p_details jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_name text;
BEGIN
  BEGIN
    SELECT COALESCE(NULLIF(btrim(pr.full_name), ''), pr.email)
      INTO v_name
      FROM public.profiles pr
     WHERE pr.id = auth.uid();

    INSERT INTO public.admin_audit_log (user_id, user_name, action, entity, entity_id, details, created_at)
    VALUES (auth.uid(), v_name, p_action, p_entity, p_entity_id, COALESCE(p_details, '{}'::jsonb), now());
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END;
$function$;

REVOKE ALL ON FUNCTION public.log_admin_action(text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_admin_action(text, text, text, jsonb) TO authenticated, service_role;

-- ---- admin_apply_discount_to_products
CREATE OR REPLACE FUNCTION public.admin_apply_discount_to_products(p_ids uuid[], p_pct numeric)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE n integer;
BEGIN
  IF NOT public.admin_can_manage_products(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF p_pct IS NULL OR p_pct <= 0 OR p_pct >= 90 THEN
    RAISE EXCEPTION 'percentual invalido';
  END IF;

  WITH upd AS (
    UPDATE public.products p
       SET original_price = GREATEST(COALESCE(p.original_price, p.price), p.price),
           price = round((GREATEST(COALESCE(p.original_price, p.price), p.price) * (1 - p_pct / 100.0))::numeric, 2),
           updated_at = now()
     WHERE p.id = ANY(p_ids)
       AND round((GREATEST(COALESCE(p.original_price, p.price), p.price) * (1 - p_pct / 100.0))::numeric, 2) < p.price
    RETURNING 1
  )
  SELECT count(*)::int INTO n FROM upd;
  PERFORM public.log_admin_action('bulk_apply_discount', 'products', NULL,
    jsonb_build_object('affected', COALESCE(n,0), 'pct', p_pct));
  RETURN COALESCE(n, 0);
END;
$function$;

-- ---- admin_delete_products
CREATE OR REPLACE FUNCTION public.admin_delete_products(p_ids uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE affected int;
BEGIN
  IF NOT public.admin_can_manage_products(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão para excluir produtos';
  END IF;
  IF p_ids IS NULL OR array_length(p_ids,1) IS NULL THEN RETURN 0; END IF;
  DELETE FROM public.products WHERE id = ANY(p_ids);
  GET DIAGNOSTICS affected = ROW_COUNT;
  PERFORM public.log_admin_action('delete_products', 'products', NULL,
    jsonb_build_object('affected', affected));
  RETURN affected;
END;
$function$;

-- ---- admin_replace_in_product_names
CREATE OR REPLACE FUNCTION public.admin_replace_in_product_names(p_ids uuid[], p_find text, p_replace text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE n integer;
BEGIN
  IF NOT public.admin_can_manage_products(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF p_find IS NULL OR btrim(p_find) = '' THEN
    RAISE EXCEPTION 'texto de busca vazio';
  END IF;

  WITH upd AS (
    UPDATE public.products p
       SET name = regexp_replace(p.name, p_find, COALESCE(p_replace, ''), 'gi'),
           updated_at = now()
     WHERE p.id = ANY(p_ids)
       AND p.name ~* p_find
    RETURNING 1
  )
  SELECT count(*)::int INTO n FROM upd;
  PERFORM public.log_admin_action('bulk_replace_names', 'products', NULL,
    jsonb_build_object('affected', COALESCE(n,0)));
  RETURN COALESCE(n, 0);
END;
$function$;

-- ---- admin_set_products_active
CREATE OR REPLACE FUNCTION public.admin_set_products_active(p_ids uuid[], p_active boolean)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE affected int;
BEGIN
  IF NOT public.admin_can_manage_products(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão para alterar produtos';
  END IF;
  IF p_ids IS NULL OR array_length(p_ids,1) IS NULL THEN RETURN 0; END IF;
  UPDATE public.products SET active = p_active WHERE id = ANY(p_ids);
  GET DIAGNOSTICS affected = ROW_COUNT;
  PERFORM public.log_admin_action('bulk_set_active', 'products', NULL,
    jsonb_build_object('affected', affected, 'value', p_active));
  RETURN affected;
END;
$function$;

-- ---- admin_set_products_category
CREATE OR REPLACE FUNCTION public.admin_set_products_category(p_ids uuid[], p_category text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE n integer;
BEGIN
  IF NOT public.admin_can_manage_products(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  WITH upd AS (
    UPDATE public.products p
       SET category = NULLIF(btrim(p_category), ''),
           updated_at = now()
     WHERE p.id = ANY(p_ids)
    RETURNING 1
  )
  SELECT count(*)::int INTO n FROM upd;
  PERFORM public.log_admin_action('bulk_set_category', 'products', NULL,
    jsonb_build_object('affected', COALESCE(n,0), 'value', NULLIF(btrim(p_category), '')));
  RETURN COALESCE(n, 0);
END;
$function$;

-- ---- admin_set_products_stock
CREATE OR REPLACE FUNCTION public.admin_set_products_stock(p_ids uuid[], p_value integer, p_mode text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE n integer;
BEGIN
  IF NOT public.admin_can_manage_products(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF p_value IS NULL OR p_mode NOT IN ('set', 'add') THEN
    RAISE EXCEPTION 'parametros invalidos';
  END IF;

  WITH upd AS (
    UPDATE public.products p
       SET stock = GREATEST(0, CASE WHEN p_mode = 'set' THEN p_value ELSE p.stock + p_value END),
           updated_at = now()
     WHERE p.id = ANY(p_ids)
    RETURNING 1
  )
  SELECT count(*)::int INTO n FROM upd;
  PERFORM public.log_admin_action('bulk_update_stock', 'products', NULL,
    jsonb_build_object('affected', COALESCE(n,0), 'value', p_value, 'mode', p_mode));
  RETURN COALESCE(n, 0);
END;
$function$;

-- ---- admin_update_product_fields
CREATE OR REPLACE FUNCTION public.admin_update_product_fields(p_id uuid, p_fields jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.admin_can_manage_products(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  UPDATE public.products p
     SET name = COALESCE(NULLIF(p_fields->>'name', ''), p.name),
         description = COALESCE(p_fields->>'description', p.description),
         category = COALESCE(NULLIF(p_fields->>'category', ''), p.category),
         brand = COALESCE(NULLIF(p_fields->>'brand', ''), p.brand),
         size = COALESCE(NULLIF(p_fields->>'size', ''), p.size),
         price = COALESCE((p_fields->>'price')::numeric, p.price),
         original_price = COALESCE((p_fields->>'original_price')::numeric, p.original_price),
         stock = COALESCE((p_fields->>'stock')::integer, p.stock),
         updated_at = now()
   WHERE p.id = p_id;

  PERFORM public.log_admin_action('update_product_fields', 'products', p_id::text,
    jsonb_build_object('affected', CASE WHEN FOUND THEN 1 ELSE 0 END,
                       'fields', (SELECT jsonb_agg(k) FROM jsonb_object_keys(COALESCE(p_fields,'{}'::jsonb)) k)));
  RETURN FOUND;
END;
$function$;

-- ---- apply_category_discount
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
  PERFORM public.log_admin_action('apply_category_discount', 'products', NULL,
    jsonb_build_object('affected', affected, 'pct', pct, 'categories', to_jsonb(categories)));
  RETURN affected;
END;
$function$;

-- ---- apply_global_discount
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
     SET mass_discount_snapshot_price = price,
         mass_discount_snapshot_original = original_price
   WHERE active = true
     AND price > 0
     AND mass_discount_snapshot_price IS NULL;

  UPDATE public.products
     SET original_price = mass_discount_snapshot_price
   WHERE active = true
     AND mass_discount_snapshot_price IS NOT NULL
     AND original_price IS NULL;

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

  PERFORM public.log_admin_action('apply_global_discount', 'products', NULL,
    jsonb_build_object('affected', affected, 'pct', pct));
  RETURN affected;
END;
$function$;

-- ---- clear_category_discount
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
  PERFORM public.log_admin_action('clear_category_discount', 'products', NULL,
    jsonb_build_object('affected', affected, 'categories', to_jsonb(categories)));
  RETURN affected;
END;
$function$;

-- ---- clear_global_discount
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

  PERFORM public.log_admin_action('clear_global_discount', 'products', NULL,
    jsonb_build_object('affected', affected));
  RETURN affected;
END;
$function$;