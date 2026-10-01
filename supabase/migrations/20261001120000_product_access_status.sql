-- Aplicada em produção em 01/10/2026 via MCP (product_access_status_adult_links).
CREATE OR REPLACE FUNCTION public.product_access_status(p_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE
    WHEN p.id IS NULL OR NOT p.active THEN 'not_found'
    WHEN NOT public.is_adult_category(p.category) THEN 'ok'
    WHEN public.can_view_adult(auth.uid()) THEN 'ok'
    ELSE public.current_user_adult_status()
  END
  FROM (SELECT 1) one LEFT JOIN public.products p ON p.id = p_id;
$$;
REVOKE ALL ON FUNCTION public.product_access_status(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.product_access_status(uuid) TO anon, authenticated;
