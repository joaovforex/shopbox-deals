-- Aggregation RPCs for the admin orders panel (no 1000-row Data API cap).

CREATE OR REPLACE FUNCTION public.admin_can_view_reports(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = _user_id AND role::text IN ('admin','manager')
  )
$$;

CREATE OR REPLACE FUNCTION public.admin_order_metrics(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_delivery text DEFAULT NULL,
  p_payment text DEFAULT NULL,
  p_category text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.admin_can_view_reports(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão para ver relatórios';
  END IF;

  WITH paid AS (
    SELECT o.id, o.total, o.delivery_fee, o.delivery_method, o.payment_method, o.payment_provider
      FROM public.orders o
     WHERE o.status = 'paid'
       AND (p_from IS NULL OR o.created_at >= p_from)
       AND (p_to IS NULL OR o.created_at <= p_to)
       AND (p_delivery IS NULL OR o.delivery_method = p_delivery)
       AND (p_payment IS NULL OR o.payment_method = p_payment)
       AND (
         p_category IS NULL OR EXISTS (
           SELECT 1 FROM public.order_items oi
             LEFT JOIN public.products pr ON pr.id = oi.product_id
            WHERE oi.order_id = o.id
              AND COALESCE(NULLIF(pr.category, ''), 'Sem categoria') = p_category
         )
       )
  ),
  items AS (
    SELECT oi.product_id,
           oi.product_name,
           COALESCE(NULLIF(pr.category, ''), 'Sem categoria') AS category,
           oi.quantity,
           oi.unit_price
      FROM public.order_items oi
      JOIN paid ON paid.id = oi.order_id
      LEFT JOIN public.products pr ON pr.id = oi.product_id
     WHERE p_category IS NULL
        OR COALESCE(NULLIF(pr.category, ''), 'Sem categoria') = p_category
  ),
  totals AS (
    SELECT
      (SELECT count(*) FROM paid)::bigint AS orders_count,
      COALESCE((SELECT SUM(quantity) FROM items), 0)::bigint AS units_sold,
      COALESCE((SELECT SUM(unit_price * quantity) FROM items), 0)::numeric AS products_revenue,
      CASE WHEN p_category IS NULL
           THEN COALESCE((SELECT SUM(COALESCE(delivery_fee, 0)) FROM paid), 0)::numeric
           ELSE 0::numeric END AS shipping_revenue,
      COALESCE((SELECT count(*) FROM paid WHERE delivery_method = 'delivery'), 0)::bigint AS delivery_count,
      COALESCE((SELECT count(*) FROM paid WHERE delivery_method = 'pickup'), 0)::bigint AS pickup_count
  ),
  by_payment AS (
    SELECT COALESCE(NULLIF(payment_method, ''), 'outro') AS method,
           COALESCE(NULLIF(payment_provider, ''), 'outro') AS provider,
           count(*)::bigint AS orders_count,
           COALESCE(SUM(total), 0)::numeric AS revenue
      FROM paid
     GROUP BY 1, 2
  ),
  by_product AS (
    SELECT product_id,
           MAX(product_name) AS name,
           SUM(quantity)::bigint AS qty,
           SUM(unit_price * quantity)::numeric AS revenue
      FROM items
     GROUP BY product_id
  ),
  by_category AS (
    SELECT category AS name,
           SUM(quantity)::bigint AS qty,
           SUM(unit_price * quantity)::numeric AS revenue
      FROM items
     GROUP BY category
  )
  SELECT jsonb_build_object(
    'orders_count', t.orders_count,
    'units_sold', t.units_sold,
    'revenue', t.products_revenue + t.shipping_revenue,
    'products_revenue', t.products_revenue,
    'shipping_revenue', t.shipping_revenue,
    'avg_ticket', CASE WHEN t.orders_count > 0
                       THEN round((t.products_revenue + t.shipping_revenue) / t.orders_count, 2)
                       ELSE 0 END,
    'delivery_count', t.delivery_count,
    'pickup_count', t.pickup_count,
    'by_payment', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                      'method', method, 'provider', provider,
                      'orders_count', orders_count, 'revenue', revenue
                    ) ORDER BY revenue DESC) FROM by_payment), '[]'::jsonb),
    'product_ranking', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                      'id', product_id, 'name', name, 'qty', qty, 'revenue', revenue
                    ) ORDER BY qty DESC) FROM by_product), '[]'::jsonb),
    'category_ranking', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                      'name', name, 'qty', qty, 'revenue', revenue
                    ) ORDER BY revenue DESC) FROM by_category), '[]'::jsonb)
  ) INTO v_result
  FROM totals t;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_orders_page(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_delivery text DEFAULT NULL,
  p_payment text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid, created_at timestamptz, customer_name text, customer_email text,
  customer_phone text, customer_cpf text, shipping_address text,
  payment_method text, delivery_method text, status text, total numeric,
  delivery_fee numeric, mp_payment_id text, refund_status text,
  refunded_amount numeric, refunded_at timestamptz, fulfillment_status text,
  total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_term text := NULLIF(trim(coalesce(p_search, '')), '');
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
         OR o.customer_name ILIKE '%' || v_term || '%'
         OR COALESCE(o.customer_email,'') ILIKE '%' || v_term || '%'
         OR o.id::text ILIKE '%' || lower(replace(v_term, '#', '')) || '%'
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
$$;

CREATE OR REPLACE FUNCTION public.admin_catalog_value()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.admin_can_view_reports(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  SELECT jsonb_build_object(
    'products', count(*)::bigint,
    'units', COALESCE(SUM(GREATEST(stock, 0)), 0)::bigint,
    'stock_value', COALESCE(SUM(price * GREATEST(stock, 0)), 0)::numeric,
    'listed_value', COALESCE(SUM(price), 0)::numeric
  ) INTO v FROM public.products WHERE active = true;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_cashback_outstanding()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.admin_can_view_reports(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  SELECT jsonb_build_object(
    'balance', COALESCE(SUM(GREATEST(amount - consumed, 0)), 0)::numeric,
    'entries', count(*)::bigint
  ) INTO v
    FROM public.cashback_entries
   WHERE expired_at IS NULL AND kind = 'earn';
  RETURN v;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_order_metrics(timestamptz, timestamptz, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_orders_page(timestamptz, timestamptz, text, text, text, text, text, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_catalog_value() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_cashback_outstanding() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_can_view_reports(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_order_metrics(timestamptz, timestamptz, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_orders_page(timestamptz, timestamptz, text, text, text, text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_catalog_value() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cashback_outstanding() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_can_view_reports(uuid) TO authenticated;

CREATE INDEX IF NOT EXISTS idx_orders_status_created_at ON public.orders (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items (order_id);