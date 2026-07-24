
CREATE OR REPLACE FUNCTION public.user_purchased_product(_user_id uuid, _product_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE oi.product_id = _product_id
      AND o.user_id = _user_id
      AND o.status = 'paid'
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_purchased_product(uuid, uuid) TO authenticated, anon;

DROP POLICY IF EXISTS "Users can insert own reviews" ON public.product_reviews;
DROP POLICY IF EXISTS "Users can update own reviews" ON public.product_reviews;
DROP POLICY IF EXISTS "product_reviews_insert_own" ON public.product_reviews;
DROP POLICY IF EXISTS "product_reviews_update_own" ON public.product_reviews;
DROP POLICY IF EXISTS "Authenticated users can insert their reviews" ON public.product_reviews;
DROP POLICY IF EXISTS "Authenticated users can update their reviews" ON public.product_reviews;

CREATE POLICY "Buyers can insert their reviews"
ON public.product_reviews
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND public.user_purchased_product(auth.uid(), product_id)
);

CREATE POLICY "Buyers can update their reviews"
ON public.product_reviews
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND public.user_purchased_product(auth.uid(), product_id)
);
