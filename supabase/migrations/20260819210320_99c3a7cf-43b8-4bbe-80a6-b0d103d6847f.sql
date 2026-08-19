CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION public.f_unaccent(text)
RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
SET search_path = public, extensions
AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;

CREATE OR REPLACE FUNCTION public.text_norm(text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = public, extensions
AS $$ SELECT regexp_replace(lower(public.f_unaccent(coalesce($1, ''))), '[^a-z0-9]+', '', 'g') $$;

GRANT EXECUTE ON FUNCTION public.f_unaccent(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.text_norm(text) TO anon, authenticated, service_role;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS search_norm text
  GENERATED ALWAYS AS (
    public.text_norm(coalesce(name,'') || ' ' || coalesce(sku,'') || ' ' || coalesce(category,'') || ' ' || coalesce(brand,''))
  ) STORED;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS search_norm text
  GENERATED ALWAYS AS (
    public.text_norm(coalesce(customer_name,'') || ' ' || coalesce(customer_email,''))
  ) STORED;

ALTER TABLE public.admin_audit_log
  ADD COLUMN IF NOT EXISTS search_norm text
  GENERATED ALWAYS AS (
    public.text_norm(coalesce(action,'') || ' ' || coalesce(entity,'') || ' ' || coalesce(user_name,''))
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_products_search_norm_trgm ON public.products USING gin (search_norm gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_orders_search_norm_trgm ON public.orders USING gin (search_norm gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_audit_search_norm_trgm ON public.admin_audit_log USING gin (search_norm gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.search_products_quick(p_term text)
RETURNS TABLE(id uuid, name text, price numeric, image_url text, images text[])
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $function$
  SELECT p.id, p.name, p.price, p.image_url, p.images
    FROM public.products p
   WHERE p.active = true
     AND length(trim(coalesce(p_term, ''))) >= 2
     AND p.search_norm LIKE '%' || public.text_norm(p_term) || '%'
   ORDER BY p.created_at DESC
   LIMIT 8;
$function$;

CREATE OR REPLACE FUNCTION public.list_products_paged(p_search text DEFAULT NULL::text, p_category text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_stock_status text DEFAULT NULL::text, p_max_price numeric DEFAULT NULL::numeric)
 RETURNS TABLE(id uuid, name text, price numeric, original_price numeric, category text, image_url text, images text[], stock integer, sku text, created_at timestamp with time zone, total_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH s AS (
    SELECT NULLIF(public.text_norm(coalesce(p_search, '')), '') AS term
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
         b.image_url, b.images, b.stock, b.sku, b.created_at,
         c.total AS total_count
    FROM base b, counted c
   ORDER BY b.created_at DESC
   LIMIT p_limit OFFSET p_offset;
$function$;

CREATE OR REPLACE FUNCTION public.admin_orders_page(p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_search text DEFAULT NULL::text, p_delivery text DEFAULT NULL::text, p_payment text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_category text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, created_at timestamp with time zone, customer_name text, customer_email text, customer_phone text, customer_cpf text, shipping_address text, payment_method text, delivery_method text, status text, total numeric, delivery_fee numeric, mp_payment_id text, refund_status text, refunded_amount numeric, refunded_at timestamp with time zone, fulfillment_status text, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_term text := NULLIF(public.text_norm(coalesce(p_search, '')), '');
  v_digits text := NULLIF(regexp_replace(coalesce(p_search, ''), '\D', '', 'g'), '');
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
BEGIN
  IF NOT public.admin_can_view_reports(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão para ver pedidos';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT o.*
      FROM public.orders o
     WHERE (p_from IS NULL OR o.created_at >= p_from)
       AND (p_to IS NULL OR o.created_at <= p_to)
       AND (p_delivery IS NULL OR o.delivery_method = p_delivery)
       AND (p_payment IS NULL OR o.payment_method = p_payment)
       AND (
         p_status IS NULL OR
         (p_status = 'paid' AND o.status = 'paid' AND o.refund_status IS NULL AND o.refunded_at IS NULL
            AND COALESCE(o.fulfillment_status,'') NOT IN ('preparing','ready','shipped','completed')) OR
         (p_status = 'fulfillment' AND o.status = 'paid' AND o.refund_status IS NULL AND o.refunded_at IS NULL
            AND o.fulfillment_status IN ('preparing','ready','shipped')) OR
         (p_status = 'delivered' AND o.status = 'paid' AND o.refund_status IS NULL AND o.refunded_at IS NULL
            AND o.fulfillment_status = 'completed') OR
         (p_status = 'refunded' AND o.status = 'paid' AND (o.refund_status IS NOT NULL OR o.refunded_at IS NOT NULL)) OR
         (p_status = 'cancelled' AND o.status <> 'paid')
       )
       AND (
         v_term IS NULL
         OR o.search_norm LIKE '%' || v_term || '%'
         OR replace(o.id::text, '-', '') LIKE '%' || v_term || '%'
         OR (v_digits IS NOT NULL AND regexp_replace(COALESCE(o.customer_cpf,''), '\D', '', 'g') LIKE '%' || v_digits || '%')
         OR (v_digits IS NOT NULL AND regexp_replace(COALESCE(o.customer_phone,''), '\D', '', 'g') LIKE '%' || v_digits || '%')
       )
       AND (
         p_category IS NULL OR EXISTS (
           SELECT 1 FROM public.order_items oi
             LEFT JOIN public.products pr ON pr.id = oi.product_id
            WHERE oi.order_id = o.id
              AND COALESCE(NULLIF(pr.category, ''), 'Sem categoria') = p_category
         )
       )
  ), counted AS (SELECT count(*) AS total FROM base)
  SELECT b.id, b.created_at, b.customer_name, b.customer_email, b.customer_phone,
         b.customer_cpf, b.shipping_address, b.payment_method, b.delivery_method,
         b.status, b.total, b.delivery_fee, b.mp_payment_id, b.refund_status,
         b.refunded_amount, b.refunded_at, b.fulfillment_status, c.total
    FROM base b, counted c
   ORDER BY b.created_at DESC
   LIMIT v_limit OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$function$;

CREATE OR REPLACE FUNCTION public.search_team_candidates(p_term text)
RETURNS TABLE(id uuid, full_name text, email text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_term text := trim(coalesce(p_term, ''));
  v_norm text := public.text_norm(coalesce(p_term, ''));
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF NOT public.has_role(v_uid, 'admin') THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  IF length(v_term) < 2 OR length(v_term) > 120 THEN RAISE EXCEPTION 'Termo inválido'; END IF;

  RETURN QUERY
  SELECT u.id, nullif(p.full_name, '') AS full_name, u.email::text AS email
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
   WHERE public.text_norm(coalesce(p.full_name, '')) LIKE '%' || v_norm || '%'
      OR public.text_norm(coalesce(u.email::text, '')) LIKE '%' || v_norm || '%'
   ORDER BY coalesce(nullif(p.full_name, ''), u.email, u.id::text)
   LIMIT 10;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_search_team_candidates(p_term text)
RETURNS TABLE(id uuid, full_name text, email text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_term text := trim(coalesce(p_term, ''));
  v_norm text := public.text_norm(coalesce(p_term, ''));
BEGIN
  IF length(v_term) < 2 OR length(v_term) > 120 THEN RAISE EXCEPTION 'Termo inválido'; END IF;

  RETURN QUERY
  SELECT u.id, nullif(p.full_name, '') AS full_name, u.email::text AS email
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
   WHERE public.text_norm(coalesce(p.full_name, '')) LIKE '%' || v_norm || '%'
      OR public.text_norm(coalesce(u.email::text, '')) LIKE '%' || v_norm || '%'
   ORDER BY coalesce(nullif(p.full_name, ''), u.email, u.id::text)
   LIMIT 10;
END;
$function$;