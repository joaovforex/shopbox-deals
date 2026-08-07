ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS asaas_payment_id text,
  ADD COLUMN IF NOT EXISTS asaas_customer_id text,
  ADD COLUMN IF NOT EXISTS asaas_status text,
  ADD COLUMN IF NOT EXISTS asaas_invoice_url text;

ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS payment_provider text NOT NULL DEFAULT 'mercadopago';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'site_settings_payment_provider_check'
  ) THEN
    ALTER TABLE public.site_settings
      ADD CONSTRAINT site_settings_payment_provider_check
      CHECK (payment_provider IN ('mercadopago', 'asaas', 'cielo'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_asaas_payment_id ON public.orders (asaas_payment_id);