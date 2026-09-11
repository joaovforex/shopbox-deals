BEGIN;

-- Apenas o backend com service role pode confirmar que o frete adicional foi
-- pago. Repetimos os REVOKEs explicitamente para corrigir permissões divergentes
-- que possam existir no banco real.
REVOKE ALL ON FUNCTION public.apply_delivery_upgrade(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_delivery_upgrade(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.apply_delivery_upgrade(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.apply_delivery_upgrade(uuid, text) TO service_role;

-- NULL não pode significar acesso global dentro de uma policy exclusiva para
-- fulfillment. Admin e manager já possuem políticas próprias.
CREATE OR REPLACE FUNCTION public.order_matches_unidade(_order_id uuid, _unidade uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _unidade IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.order_items oi
    JOIN public.products p ON p.id = oi.product_id
    WHERE oi.order_id = _order_id
      AND p.unidade_id = _unidade
  )
$$;

DROP POLICY IF EXISTS "Fulfillment can view order items" ON public.order_items;
CREATE POLICY "Fulfillment can view order items"
ON public.order_items
FOR SELECT
TO authenticated
USING (
  has_role_name(auth.uid(), 'fulfillment')
  AND fulfillment_scope_unidade(auth.uid()) IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.products p
    WHERE p.id = order_items.product_id
      AND p.unidade_id = fulfillment_scope_unidade(auth.uid())
  )
);

COMMIT;
