
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz,
  ADD COLUMN IF NOT EXISTS refunded_amount numeric,
  ADD COLUMN IF NOT EXISTS refund_reason text,
  ADD COLUMN IF NOT EXISTS refunded_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS refunded_by_name text,
  ADD COLUMN IF NOT EXISTS mp_refund_id text,
  ADD COLUMN IF NOT EXISTS refund_status text;

CREATE INDEX IF NOT EXISTS orders_refund_status_idx ON public.orders (refund_status);
