
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS shipping_recipient_name text,
  ADD COLUMN IF NOT EXISTS shipping_recipient_phone text,
  ADD COLUMN IF NOT EXISTS delivery_fee numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS maisentregas_order_id text,
  ADD COLUMN IF NOT EXISTS maisentregas_status text,
  ADD COLUMN IF NOT EXISTS maisentregas_tracking_url text,
  ADD COLUMN IF NOT EXISTS maisentregas_last_check_at timestamptz,
  ADD COLUMN IF NOT EXISTS maisentregas_last_error text,
  ADD COLUMN IF NOT EXISTS maisentregas_created_at timestamptz;

CREATE INDEX IF NOT EXISTS orders_maisentregas_poll_idx
  ON public.orders (maisentregas_status)
  WHERE maisentregas_order_id IS NOT NULL
    AND maisentregas_status NOT IN ('entregue','cancelado','devolvido');

CREATE INDEX IF NOT EXISTS orders_delivery_pending_create_idx
  ON public.orders (status, delivery_method)
  WHERE status = 'paid' AND delivery_method = 'delivery' AND maisentregas_order_id IS NULL;
