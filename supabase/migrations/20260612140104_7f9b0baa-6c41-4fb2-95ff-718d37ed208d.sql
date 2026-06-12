-- Extensão para busca por similaridade
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Índices otimizados
CREATE INDEX IF NOT EXISTS products_active_category_created_idx
  ON public.products (category, created_at DESC)
  WHERE active = true;

CREATE INDEX IF NOT EXISTS products_active_created_idx
  ON public.products (created_at DESC)
  WHERE active = true;

CREATE INDEX IF NOT EXISTS products_name_trgm_idx
  ON public.products USING gin (lower(name) gin_trgm_ops);

-- RPC: listagem paginada server-side (campos mínimos para o card)
CREATE OR REPLACE FUNCTION public.list_products_paged(
  p_search text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_limit int DEFAULT 24,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  name text,
  price numeric,
  original_price numeric,
  category text,
  image_url text,
  images text[],
  stock int,
  created_at timestamptz,
  total_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT p.id, p.name, p.price, p.original_price, p.category,
           p.image_url, p.images, p.stock, p.created_at
      FROM public.products p
     WHERE p.active = true
       AND (p_category IS NULL OR p.category = p_category)
       AND (
         p_search IS NULL
         OR length(trim(p_search)) = 0
         OR lower(p.name) LIKE '%' || lower(trim(p_search)) || '%'
       )
  ),
  total AS (SELECT count(*)::bigint AS c FROM base)
  SELECT b.id, b.name, b.price, b.original_price, b.category,
         b.image_url, b.images, b.stock, b.created_at,
         (SELECT c FROM total) AS total_count
    FROM base b
   ORDER BY b.created_at DESC
   LIMIT greatest(1, least(coalesce(p_limit, 24), 100))
   OFFSET greatest(0, coalesce(p_offset, 0));
$$;

GRANT EXECUTE ON FUNCTION public.list_products_paged(text, text, int, int) TO anon, authenticated;

-- RPC: busca rápida para o autocomplete do header (top 8)
CREATE OR REPLACE FUNCTION public.search_products_quick(p_term text)
RETURNS TABLE (
  id uuid,
  name text,
  price numeric,
  image_url text,
  images text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.name, p.price, p.image_url, p.images
    FROM public.products p
   WHERE p.active = true
     AND length(trim(coalesce(p_term, ''))) >= 2
     AND lower(p.name) LIKE '%' || lower(trim(p_term)) || '%'
   ORDER BY p.created_at DESC
   LIMIT 8;
$$;

GRANT EXECUTE ON FUNCTION public.search_products_quick(text) TO anon, authenticated;