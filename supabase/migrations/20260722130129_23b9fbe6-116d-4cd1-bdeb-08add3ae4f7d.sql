-- 1) Busca sem acento/pontuação
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION public.list_products_paged(
  p_search text DEFAULT NULL::text,
  p_category text DEFAULT NULL::text,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_stock_status text DEFAULT NULL::text,
  p_max_price numeric DEFAULT NULL::numeric
)
RETURNS TABLE(id uuid, name text, price numeric, original_price numeric, category text, image_url text, images text[], stock integer, sku text, created_at timestamptz, total_count bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH s AS (
    SELECT NULLIF(regexp_replace(lower(public.unaccent(coalesce(p_search, ''))), '[^a-z0-9 ]+', ' ', 'g'), '') AS term
  ),
  base AS (
    SELECT p.id, p.name, p.price, p.original_price, p.category,
           p.image_url, p.images, p.stock, p.sku, p.created_at
      FROM public.products p, s
     WHERE p.active = true
       AND (p_category IS NULL OR p.category = p_category)
       AND (p_max_price IS NULL OR p.price <= p_max_price)
       AND (
         s.term IS NULL
         OR lower(public.unaccent(p.name)) LIKE '%' || s.term || '%'
         OR lower(public.unaccent(coalesce(p.sku, ''))) LIKE '%' || s.term || '%'
         OR lower(public.unaccent(coalesce(p.category, ''))) LIKE '%' || s.term || '%'
       )
       AND (
         p_stock_status IS NULL
         OR p_stock_status = 'all'
         OR (p_stock_status = 'in_stock' AND p.stock > 0)
         OR (p_stock_status = 'out_of_stock' AND p.stock = 0)
       )
  ),
  total AS (SELECT count(*)::bigint AS c FROM base)
  SELECT b.id, b.name, b.price, b.original_price, b.category,
         b.image_url, b.images, b.stock, b.sku, b.created_at,
         (SELECT c FROM total) AS total_count
    FROM base b
   ORDER BY b.created_at DESC
   LIMIT greatest(1, least(coalesce(p_limit, 50), 100))
   OFFSET greatest(0, coalesce(p_offset, 0));
$function$;

-- 2) RPCs administrativas robustas (não dependem de RLS combinada)
CREATE OR REPLACE FUNCTION public.admin_can_manage_products(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = _user_id AND role::text IN ('admin','manager','catalog')
  )
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_products(p_ids uuid[])
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE affected int;
BEGIN
  IF NOT public.admin_can_manage_products(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão para excluir produtos';
  END IF;
  IF p_ids IS NULL OR array_length(p_ids,1) IS NULL THEN RETURN 0; END IF;
  DELETE FROM public.products WHERE id = ANY(p_ids);
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_products_active(p_ids uuid[], p_active boolean)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE affected int;
BEGIN
  IF NOT public.admin_can_manage_products(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão para alterar produtos';
  END IF;
  IF p_ids IS NULL OR array_length(p_ids,1) IS NULL THEN RETURN 0; END IF;
  UPDATE public.products SET active = p_active WHERE id = ANY(p_ids);
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_products(uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_products_active(uuid[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_products(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_products_active(uuid[], boolean) TO authenticated;