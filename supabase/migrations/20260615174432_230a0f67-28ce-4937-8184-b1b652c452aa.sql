
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sku text;

CREATE OR REPLACE FUNCTION public.generate_product_sku()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
  i int;
  attempts int := 0;
BEGIN
  LOOP
    candidate := '';
    FOR i IN 1..6 LOOP
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.products WHERE sku = candidate);
    attempts := attempts + 1;
    IF attempts > 50 THEN
      candidate := candidate || substr(md5(random()::text), 1, 2);
      EXIT;
    END IF;
  END LOOP;
  RETURN candidate;
END;
$$;

CREATE OR REPLACE FUNCTION public.products_set_sku()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.sku IS NULL OR length(trim(NEW.sku)) = 0 THEN
    NEW.sku := public.generate_product_sku();
  ELSE
    NEW.sku := upper(trim(NEW.sku));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_set_sku_trg ON public.products;
CREATE TRIGGER products_set_sku_trg
BEFORE INSERT ON public.products
FOR EACH ROW EXECUTE FUNCTION public.products_set_sku();

UPDATE public.products SET sku = public.generate_product_sku() WHERE sku IS NULL;

ALTER TABLE public.products ALTER COLUMN sku SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS products_sku_unique_idx ON public.products (sku);

DROP FUNCTION IF EXISTS public.list_products_paged(text, text, integer, integer);

CREATE FUNCTION public.list_products_paged(
  p_search text DEFAULT NULL::text,
  p_category text DEFAULT NULL::text,
  p_limit integer DEFAULT 24,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid, name text, price numeric, original_price numeric, category text,
  image_url text, images text[], stock integer, sku text,
  created_at timestamp with time zone, total_count bigint
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
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
  ),
  total AS (SELECT count(*)::bigint AS c FROM base)
  SELECT b.id, b.name, b.price, b.original_price, b.category,
         b.image_url, b.images, b.stock, b.sku, b.created_at,
         (SELECT c FROM total) AS total_count
    FROM base b
   ORDER BY b.created_at DESC
   LIMIT greatest(1, least(coalesce(p_limit, 24), 100))
   OFFSET greatest(0, coalesce(p_offset, 0));
$function$;

GRANT EXECUTE ON FUNCTION public.list_products_paged(text, text, integer, integer) TO anon, authenticated;
