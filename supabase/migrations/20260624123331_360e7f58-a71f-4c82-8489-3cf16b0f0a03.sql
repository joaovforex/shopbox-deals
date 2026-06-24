
-- Optimize products RLS: wrap auth call in SELECT to make it an InitPlan (evaluated once, not per-row).
DROP POLICY IF EXISTS "Anyone can view active products" ON public.products;
CREATE POLICY "Anyone can view active products" ON public.products
  FOR SELECT
  USING (active = true OR (SELECT public.has_role(auth.uid(), 'admin'::app_role)));

-- Make catalog listing RPC bypass per-row RLS (it already filters active explicitly).
CREATE OR REPLACE FUNCTION public.list_products_paged(
  p_search text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_limit integer DEFAULT 24,
  p_offset integer DEFAULT 0,
  p_stock_status text DEFAULT NULL
)
RETURNS TABLE(id uuid, name text, price numeric, original_price numeric, category text, image_url text, images text[], stock integer, sku text, created_at timestamptz, total_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH base AS (
    SELECT p.id, p.name, p.price, p.original_price, p.category,
           p.image_url, p.images, p.stock, p.sku, p.created_at
      FROM public.products p
     WHERE p.active = true
       AND (p_category IS NULL OR p.category = p_category)
       AND (
         p_search IS NULL
         OR length(trim(p_search)) = 0
         OR lower(p.name) LIKE '%' || lower(trim(p_search)) || '%'
         OR lower(p.sku) LIKE '%' || lower(trim(p_search)) || '%'
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
   LIMIT greatest(1, least(coalesce(p_limit, 24), 100))
   OFFSET greatest(0, coalesce(p_offset, 0));
$$;

CREATE OR REPLACE FUNCTION public.list_used_categories()
RETURNS TABLE(category text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT p.category
    FROM public.products p
   WHERE p.active = true
     AND p.category IS NOT NULL
     AND length(p.category) > 0
   ORDER BY p.category;
$$;

GRANT EXECUTE ON FUNCTION public.list_products_paged(text, text, integer, integer, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_used_categories() TO anon, authenticated;

ANALYZE public.products;
