ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_quote_distance_km numeric,
  ADD COLUMN IF NOT EXISTS delivery_quote_eta_minutes integer,
  ADD COLUMN IF NOT EXISTS delivery_quote_at timestamptz;

COMMENT ON COLUMN public.orders.delivery_quote_distance_km IS 'Distância (km) retornada pela cotação TBT/Mais Entregas';
COMMENT ON COLUMN public.orders.delivery_quote_eta_minutes IS 'Tempo estimado (min) retornado pela cotação TBT/Mais Entregas';
COMMENT ON COLUMN public.orders.delivery_quote_at IS 'Momento em que o frete real foi cotado';