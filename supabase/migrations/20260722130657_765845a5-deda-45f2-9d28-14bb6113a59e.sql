
CREATE OR REPLACE FUNCTION public.list_products_paged(
  p_search text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_stock_status text DEFAULT NULL,
  p_max_price numeric DEFAULT NULL
)
RETURNS TABLE(
  id uuid, name text, price numeric, original_price numeric, category text,
  image_url text, images text[], stock integer, sku text,
  created_at timestamptz, total_count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH s AS (
    SELECT NULLIF(
      regexp_replace(lower(public.unaccent(coalesce(p_search, ''))), '[^a-z0-9]+', '', 'g'),
      ''
    ) AS term
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
         OR regexp_replace(lower(public.unaccent(p.name)), '[^a-z0-9]+', '', 'g') LIKE '%' || s.term || '%'
         OR regexp_replace(lower(public.unaccent(coalesce(p.sku, ''))), '[^a-z0-9]+', '', 'g') LIKE '%' || s.term || '%'
         OR regexp_replace(lower(public.unaccent(coalesce(p.category, ''))), '[^a-z0-9]+', '', 'g') LIKE '%' || s.term || '%'
         OR regexp_replace(lower(public.unaccent(coalesce(p.description, ''))), '[^a-z0-9]+', '', 'g') LIKE '%' || s.term || '%'
       )
       AND (
         p_stock_status IS NULL
         OR (p_stock_status = 'in_stock' AND p.stock > 0)
         OR (p_stock_status = 'out_of_stock' AND p.stock = 0)
       )
  ),
  counted AS (SELECT count(*) AS total FROM base)
  SELECT b.id, b.name, b.price, b.original_price, b.category,
         b.image_url, b.images, b.stock, b.sku, b.created_at,
         c.total AS total_count
    FROM base b, counted c
   ORDER BY b.created_at DESC
   LIMIT p_limit OFFSET p_offset;
$$;
