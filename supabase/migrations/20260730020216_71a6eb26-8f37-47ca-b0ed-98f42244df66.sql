ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS brand text,
  ADD COLUMN IF NOT EXISTS size text;

CREATE INDEX IF NOT EXISTS products_brand_idx ON public.products (brand) WHERE brand IS NOT NULL;
CREATE INDEX IF NOT EXISTS products_size_idx ON public.products (size) WHERE size IS NOT NULL;

-- ============ Ações em massa (SECURITY DEFINER, com checagem de papel) ============

CREATE OR REPLACE FUNCTION public.admin_apply_discount_to_products(p_ids uuid[], p_pct numeric)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  RETURN COALESCE(n, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_products_stock(p_ids uuid[], p_value integer, p_mode text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  RETURN COALESCE(n, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_products_category(p_ids uuid[], p_category text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  RETURN COALESCE(n, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_replace_in_product_names(p_ids uuid[], p_find text, p_replace text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  RETURN COALESCE(n, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_product_fields(p_id uuid, p_fields jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_apply_discount_to_products(uuid[], numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_products_stock(uuid[], integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_products_category(uuid[], text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_replace_in_product_names(uuid[], text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_update_product_fields(uuid, jsonb) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_apply_discount_to_products(uuid[], numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_products_stock(uuid[], integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_products_category(uuid[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_replace_in_product_names(uuid[], text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_product_fields(uuid, jsonb) TO authenticated;