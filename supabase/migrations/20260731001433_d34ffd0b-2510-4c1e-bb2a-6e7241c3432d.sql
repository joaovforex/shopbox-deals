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
    'active_count', count(*)::bigint,
    'out_of_stock_count', count(*) FILTER (WHERE COALESCE(stock,0) <= 0)::bigint,
    'total_units', COALESCE(SUM(GREATEST(COALESCE(stock,0), 0)), 0)::bigint,
    'total_retail', COALESCE(SUM(price * GREATEST(COALESCE(stock,0), 0)), 0)::numeric,
    'total_original', COALESCE(SUM(COALESCE(original_price, price) * GREATEST(COALESCE(stock,0), 0)), 0)::numeric
  ) INTO v FROM public.products WHERE active = true;
  RETURN v;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_catalog_value() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_catalog_value() TO authenticated;