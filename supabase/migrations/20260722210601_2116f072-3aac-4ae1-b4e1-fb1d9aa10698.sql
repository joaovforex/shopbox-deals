
CREATE TABLE IF NOT EXISTS public.product_price_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  price NUMERIC(10,2) NOT NULL,
  original_price NUMERIC(10,2),
  snapshot_date DATE NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_pps_product_date
  ON public.product_price_snapshots (product_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_pps_date
  ON public.product_price_snapshots (snapshot_date DESC);

GRANT SELECT ON public.product_price_snapshots TO authenticated;
GRANT ALL ON public.product_price_snapshots TO service_role;

ALTER TABLE public.product_price_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view price snapshots"
  ON public.product_price_snapshots
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
  );

CREATE OR REPLACE FUNCTION public.snapshot_product_prices_daily()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
  v_today DATE := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  INSERT INTO public.product_price_snapshots (product_id, price, original_price, snapshot_date)
  SELECT p.id, p.price, p.original_price, v_today
  FROM public.products p
  WHERE p.active = true
  ON CONFLICT (product_id, snapshot_date) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.snapshot_product_prices_daily() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.snapshot_product_prices_daily() TO service_role;

CREATE OR REPLACE FUNCTION public.get_latest_price_snapshot(_product_id UUID)
RETURNS TABLE (
  price NUMERIC,
  original_price NUMERIC,
  snapshot_date DATE
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT price, original_price, snapshot_date
  FROM public.product_price_snapshots
  WHERE product_id = _product_id
  ORDER BY snapshot_date DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_latest_price_snapshot(UUID) TO authenticated;

SELECT public.snapshot_product_prices_daily();

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule('snapshot-product-prices-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'snapshot-product-prices-daily',
  '0 6 * * *',
  $$ SELECT public.snapshot_product_prices_daily(); $$
);
