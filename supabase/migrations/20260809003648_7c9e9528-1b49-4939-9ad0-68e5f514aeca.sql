CREATE OR REPLACE FUNCTION public.admin_order_metrics(p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_delivery text DEFAULT NULL::text, p_payment text DEFAULT NULL::text, p_category text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_unknown constant text := 'Sem categoria (produto removido)';
BEGIN
  IF NOT public.admin_can_view_reports(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão para ver relatórios';
  END IF;

  WITH paid AS (
    SELECT o.id, o.total, o.delivery_fee, o.delivery_method, o.payment_method, o.payment_provider,
           COALESCE(o.cashback_used, 0) AS cashback_used
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
              AND COALESCE(NULLIF(oi.category, ''), NULLIF(pr.category, ''), v_unknown) = p_category
         )
       )
  ),
  items AS (
    SELECT oi.product_id,
           COALESCE(NULLIF(oi.product_name, ''), 'Produto removido') AS product_name,
           COALESCE(NULLIF(oi.category, ''), NULLIF(pr.category, ''), v_unknown) AS category,
           oi.quantity,
           oi.unit_price
      FROM public.order_items oi
      JOIN paid ON paid.id = oi.order_id
      LEFT JOIN public.products pr ON pr.id = oi.product_id
     WHERE p_category IS NULL
        OR COALESCE(NULLIF(oi.category, ''), NULLIF(pr.category, ''), v_unknown) = p_category
  ),
  totals AS (
    SELECT
      (SELECT count(*) FROM paid)::bigint AS orders_count,
      COALESCE((SELECT SUM(quantity) FROM items), 0)::bigint AS units_sold,
      COALESCE((SELECT SUM(unit_price * quantity) FROM items), 0)::numeric AS products_revenue,
      CASE WHEN p_category IS NULL
           THEN COALESCE((SELECT SUM(COALESCE(delivery_fee, 0)) FROM paid), 0)::numeric
           ELSE 0::numeric END AS shipping_revenue,
      CASE WHEN p_category IS NULL
           THEN COALESCE((SELECT SUM(cashback_used) FROM paid), 0)::numeric
           ELSE 0::numeric END AS cashback_used_total,
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
    SELECT product_name AS name,
           MAX(product_id::text) AS id,
           SUM(quantity)::bigint AS qty,
           SUM(unit_price * quantity)::numeric AS revenue
      FROM items
     GROUP BY product_name
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
    'cashback_used_total', t.cashback_used_total,
    'cash_collected', GREATEST(t.products_revenue + t.shipping_revenue - t.cashback_used_total, 0),
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
                      'id', id, 'name', name, 'qty', qty, 'revenue', revenue
                    ) ORDER BY qty DESC) FROM by_product), '[]'::jsonb),
    'category_ranking', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                      'name', name, 'qty', qty, 'revenue', revenue
                    ) ORDER BY revenue DESC) FROM by_category), '[]'::jsonb)
  ) INTO v_result
  FROM totals t;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_order_metrics(timestamptz, timestamptz, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_order_metrics(timestamptz, timestamptz, text, text, text) TO authenticated;