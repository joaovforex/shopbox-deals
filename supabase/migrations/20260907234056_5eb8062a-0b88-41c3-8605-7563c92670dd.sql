CREATE OR REPLACE FUNCTION public.order_matches_unidade(_order_id uuid, _unidade uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT _unidade IS NULL OR EXISTS (
    SELECT 1
    FROM public.order_items oi
    JOIN public.products p ON p.id = oi.product_id
    WHERE oi.order_id = _order_id
      AND p.unidade_id = _unidade
  )
$function$;

DROP POLICY IF EXISTS "Fulfillment can view order items" ON public.order_items;
CREATE POLICY "Fulfillment can view order items"
ON public.order_items
FOR SELECT
USING (
  has_role_name(auth.uid(), 'fulfillment') AND (
    fulfillment_scope_unidade(auth.uid()) IS NULL
    OR EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = order_items.product_id
        AND p.unidade_id = fulfillment_scope_unidade(auth.uid())
    )
  )
);