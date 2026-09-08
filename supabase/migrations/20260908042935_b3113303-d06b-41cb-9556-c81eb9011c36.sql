CREATE TABLE public.site_banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  desktop_url text NOT NULL,
  mobile_url text NOT NULL,
  alt_text text NOT NULL,
  link_url text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT ON public.site_banners TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_banners TO authenticated;
GRANT ALL ON public.site_banners TO service_role;

ALTER TABLE public.site_banners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read active site_banners"
  ON public.site_banners FOR SELECT
  TO anon, authenticated
  USING (
    is_active = true
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at IS NULL OR ends_at > now())
  );

CREATE POLICY "superadmin read site_banners"
  ON public.site_banners FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "superadmin insert site_banners"
  ON public.site_banners FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "superadmin update site_banners"
  ON public.site_banners FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "superadmin delete site_banners"
  ON public.site_banners FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX site_banners_active_order_idx
  ON public.site_banners (is_active, sort_order, created_at);

CREATE OR REPLACE FUNCTION public.site_banners_validate()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.ends_at IS NOT NULL AND NEW.starts_at IS NOT NULL AND NEW.ends_at <= NEW.starts_at THEN
    RAISE EXCEPTION 'ends_at deve ser posterior a starts_at';
  END IF;
  IF btrim(NEW.alt_text) = '' THEN
    RAISE EXCEPTION 'alt_text nao pode ser vazio';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER site_banners_validate_trg
  BEFORE INSERT OR UPDATE ON public.site_banners
  FOR EACH ROW EXECUTE FUNCTION public.site_banners_validate();

INSERT INTO public.site_banners (desktop_url, mobile_url, alt_text, link_url, sort_order, is_active)
SELECT s.banner_desktop_url, s.banner_mobile_url,
       'Ofertas shopbox', '/loja', 0, true
  FROM public.site_settings s
 WHERE s.id = 1
   AND s.banner_desktop_url IS NOT NULL
   AND s.banner_mobile_url IS NOT NULL
   AND btrim(s.banner_desktop_url) <> ''
   AND btrim(s.banner_mobile_url) <> '';

DROP FUNCTION IF EXISTS public.list_products_paged(text, text, integer, integer, text, numeric);

CREATE OR REPLACE FUNCTION public.list_products_paged(
  p_search text DEFAULT NULL::text,
  p_category text DEFAULT NULL::text,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_stock_status text DEFAULT NULL::text,
  p_max_price numeric DEFAULT NULL::numeric
)
RETURNS TABLE(id uuid, name text, price numeric, original_price numeric, category text, image_url text, images text[], stock integer, sku text, created_at timestamp with time zone, unidade_id uuid, color_variants jsonb, total_count bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH s AS (
    SELECT NULLIF(public.text_norm(coalesce(p_search, '')), '') AS term
  ),
  base AS (
    SELECT p.id, p.name, p.price, p.original_price, p.category,
           p.image_url, p.images, p.stock, p.sku, p.created_at, p.unidade_id,
           p.color_variants
      FROM public.products p, s
     WHERE p.active = true
       AND (p_category IS NULL OR p.category = p_category)
       AND (p_max_price IS NULL OR p.price <= p_max_price)
       AND (
         s.term IS NULL
         OR p.search_norm LIKE '%' || s.term || '%'
         OR public.text_norm(coalesce(p.description, '')) LIKE '%' || s.term || '%'
       )
       AND (
         p_stock_status IS NULL
         OR (p_stock_status = 'in_stock' AND p.stock > 0)
         OR (p_stock_status = 'out_of_stock' AND p.stock = 0)
       )
  ),
  counted AS (SELECT count(*) AS total FROM base)
  SELECT b.id, b.name, b.price, b.original_price, b.category,
         b.image_url, b.images, b.stock, b.sku, b.created_at, b.unidade_id,
         b.color_variants,
         c.total AS total_count
    FROM base b, counted c
   ORDER BY b.created_at DESC
   LIMIT p_limit OFFSET p_offset;
$function$;