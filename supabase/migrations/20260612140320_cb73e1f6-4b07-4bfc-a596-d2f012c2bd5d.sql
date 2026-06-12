CREATE OR REPLACE FUNCTION public.list_used_categories()
RETURNS TABLE (category text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT DISTINCT p.category
    FROM public.products p
   WHERE p.active = true
     AND p.category IS NOT NULL
     AND length(p.category) > 0
   ORDER BY p.category;
$$;