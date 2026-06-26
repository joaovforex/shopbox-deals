
-- 1) Products SELECT policy: explicit allow for staff roles, customers see only active
DROP POLICY IF EXISTS "Anyone can view active products" ON public.products;
CREATE POLICY "Anyone can view active products" ON public.products
  FOR SELECT
  USING (
    active = true
    OR (SELECT public.has_role(auth.uid(), 'admin'::app_role))
    OR (SELECT public.has_role(auth.uid(), 'manager'::app_role))
    OR (SELECT public.has_role(auth.uid(), 'catalog'::app_role))
  );

COMMENT ON POLICY "Anyone can view active products" ON public.products IS
  'Customers (anon and authenticated without staff role) see only active products. Staff roles (admin/manager/catalog) see all products for editing. Realtime broadcasts on this table are filtered per-subscriber by this policy.';

-- 2) Refunds: confirm admin-only as intentional (contains PII: name/email/phone/CPF)
COMMENT ON POLICY "Admins veem reembolsos" ON public.refunds IS
  'Intentional: refunds table holds customer PII (name, email, phone, CPF). Only admin role may SELECT. Fulfillment/manager process refunds through SECURITY DEFINER functions that do not return PII columns.';

-- 3) Private secrets table for cron auth (service-role only)
CREATE TABLE IF NOT EXISTS public.app_secrets (
  name text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON public.app_secrets FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.app_secrets TO service_role;

ALTER TABLE public.app_secrets ENABLE ROW LEVEL SECURITY;
-- No policies => no access for anon/authenticated. Only service_role (which bypasses RLS) can read/write.

INSERT INTO public.app_secrets(name, value)
VALUES ('cron_secret', '15b4da890a07b4b693399bb1a2439af3de768be5ac1f5e22c57096e8791f2fe5')
ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
