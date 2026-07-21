DROP POLICY IF EXISTS "Staff can view pos_charges" ON public.pos_charges;
CREATE POLICY "Staff can view pos_charges" ON public.pos_charges FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
  OR public.has_role(auth.uid(), 'catalog'::app_role)
  OR public.has_role(auth.uid(), 'fulfillment'::app_role)
  OR public.has_role(auth.uid(), 'cashier'::app_role)
);