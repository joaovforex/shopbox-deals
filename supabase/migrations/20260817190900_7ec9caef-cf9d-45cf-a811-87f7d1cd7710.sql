ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS unidade_id uuid REFERENCES public.unidades(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.user_role_unidade(_user_id uuid, _role text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT unidade_id
  FROM public.user_roles
  WHERE user_id = _user_id AND role::text = _role
  ORDER BY created_at DESC
  LIMIT 1
$$;

-- Unidade "efetiva" do expedidor: NULL = todas as unidades
CREATE OR REPLACE FUNCTION public.fulfillment_scope_unidade(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.has_role(_user_id, 'admin'::app_role) THEN NULL
    WHEN public.has_role(_user_id, 'manager'::app_role) THEN NULL
    ELSE public.user_role_unidade(_user_id, 'fulfillment')
  END
$$;

CREATE OR REPLACE FUNCTION public.order_matches_unidade(_order_id uuid, _unidade uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _unidade IS NULL OR EXISTS (
    SELECT 1
    FROM public.order_items oi
    LEFT JOIN public.products p ON p.id = oi.product_id
    WHERE oi.order_id = _order_id
      AND (p.unidade_id IS NULL OR p.unidade_id = _unidade)
  )
$$;

GRANT EXECUTE ON FUNCTION public.user_role_unidade(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fulfillment_scope_unidade(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.order_matches_unidade(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "Fulfillment can view orders" ON public.orders;
CREATE POLICY "Fulfillment can view orders"
ON public.orders FOR SELECT TO authenticated
USING (
  has_role_name(auth.uid(), 'fulfillment')
  AND public.order_matches_unidade(id, public.fulfillment_scope_unidade(auth.uid()))
);

DROP POLICY IF EXISTS "Fulfillment can update orders" ON public.orders;
CREATE POLICY "Fulfillment can update orders"
ON public.orders FOR UPDATE TO authenticated
USING (
  has_role_name(auth.uid(), 'fulfillment')
  AND public.order_matches_unidade(id, public.fulfillment_scope_unidade(auth.uid()))
);

DROP POLICY IF EXISTS "Fulfillment can view order items" ON public.order_items;
CREATE POLICY "Fulfillment can view order items"
ON public.order_items FOR SELECT TO authenticated
USING (
  has_role_name(auth.uid(), 'fulfillment')
  AND (
    public.fulfillment_scope_unidade(auth.uid()) IS NULL
    OR EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = order_items.product_id
        AND (p.unidade_id IS NULL OR p.unidade_id = public.fulfillment_scope_unidade(auth.uid()))
    )
    OR order_items.product_id IS NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_products_unidade_id ON public.products(unidade_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_unidade_id ON public.user_roles(unidade_id);