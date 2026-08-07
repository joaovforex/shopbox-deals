ALTER TABLE public.refunds
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'asaas',
  ADD COLUMN IF NOT EXISTS provider_payment_id text,
  ADD COLUMN IF NOT EXISTS provider_status text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'confirmed',
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS failure_reason text;

ALTER TABLE public.refunds DROP CONSTRAINT IF EXISTS refunds_status_check;
ALTER TABLE public.refunds ADD CONSTRAINT refunds_status_check
  CHECK (status IN ('pending','confirmed','cancelled','manual'));

CREATE INDEX IF NOT EXISTS idx_refunds_status_pending
  ON public.refunds (status, created_at DESC) WHERE status = 'pending';

UPDATE public.refunds
SET provider_payment_id = COALESCE(provider_payment_id, mp_payment_id),
    status = 'pending',
    provider_status = 'AWAITING_CUSTOMER_EXTERNAL_AUTHORIZATION',
    last_checked_at = now()
WHERE id = 'c135882c-9650-4825-a3b3-963dcbfec5cb';

UPDATE public.refunds
SET provider_payment_id = COALESCE(provider_payment_id, mp_payment_id)
WHERE provider_payment_id IS NULL;