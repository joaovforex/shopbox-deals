
-- 1) Novas colunas em orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_provider text NOT NULL DEFAULT 'cielo',
  ADD COLUMN IF NOT EXISTS cielo_payment_id text,
  ADD COLUMN IF NOT EXISTS cielo_checkout_url text,
  ADD COLUMN IF NOT EXISTS cielo_status text,
  ADD COLUMN IF NOT EXISTS cielo_payment_method text,
  ADD COLUMN IF NOT EXISTS cielo_installments integer,
  ADD COLUMN IF NOT EXISTS cielo_tid text,
  ADD COLUMN IF NOT EXISTS cielo_authorization_code text,
  ADD COLUMN IF NOT EXISTS cielo_return_code text,
  ADD COLUMN IF NOT EXISTS cielo_return_message text,
  ADD COLUMN IF NOT EXISTS cielo_last_check_at timestamptz;

-- Pedidos antigos permanecem como mercadopago
UPDATE public.orders SET payment_provider = 'mercadopago'
WHERE mp_preference_id IS NOT NULL AND cielo_payment_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_orders_cielo_payment_id ON public.orders(cielo_payment_id) WHERE cielo_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_payment_provider ON public.orders(payment_provider);

-- 2) Tabela de webhooks Cielo (idempotência + auditoria)
CREATE TABLE IF NOT EXISTS public.cielo_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id text NOT NULL,
  change_type integer NOT NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  raw_payload jsonb,
  cielo_status integer,
  processed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payment_id, change_type)
);

GRANT ALL ON public.cielo_webhook_events TO service_role;

ALTER TABLE public.cielo_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read cielo webhook events"
  ON public.cielo_webhook_events
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_cielo_events_payment_id ON public.cielo_webhook_events(payment_id);
CREATE INDEX IF NOT EXISTS idx_cielo_events_order_id ON public.cielo_webhook_events(order_id);
