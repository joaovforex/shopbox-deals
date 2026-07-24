CREATE TABLE public.product_reviews (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, user_id)
);

CREATE INDEX product_reviews_product_id_idx ON public.product_reviews (product_id, created_at DESC);

GRANT SELECT ON public.product_reviews TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.product_reviews TO authenticated;
GRANT ALL ON public.product_reviews TO service_role;

ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read reviews"
  ON public.product_reviews FOR SELECT
  USING (true);

CREATE POLICY "Authenticated can insert own review"
  ON public.product_reviews FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "User can update own review"
  ON public.product_reviews FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "User can delete own review"
  ON public.product_reviews FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_product_reviews_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_product_reviews_updated_at
  BEFORE UPDATE ON public.product_reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_product_reviews_updated_at();