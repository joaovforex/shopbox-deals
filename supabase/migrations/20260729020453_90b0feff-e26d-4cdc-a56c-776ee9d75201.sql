-- 1) Avaliações: remove policies duplicadas que reabriam a restrição de "só quem comprou"
DROP POLICY IF EXISTS "Authenticated can insert own review" ON public.product_reviews;
DROP POLICY IF EXISTS "User can update own review" ON public.product_reviews;

-- 2) Menor privilégio: catalog não vê pedidos
DROP POLICY IF EXISTS "Catalog can view orders" ON public.orders;

-- 3) has_role / has_role_name como SECURITY DEFINER com search_path fixo
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.has_role_name(_user_id uuid, _role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role::text = _role
  )
$$;

-- 4) Cron Cielo: passar a usar x-cron-secret (mesma proteção dos demais crons)
DO $$
DECLARE
  v_cron_secret text;
BEGIN
  SELECT value INTO v_cron_secret FROM public.app_secrets WHERE name = 'cron_secret';
  IF v_cron_secret IS NULL THEN
    RAISE NOTICE 'cron_secret ausente em app_secrets — jobs Cielo não reagendados';
    RETURN;
  END IF;

  PERFORM cron.unschedule('reconcile-cielo-orders');
  PERFORM cron.schedule(
    'reconcile-cielo-orders',
    '*/10 * * * *',
    format($job$
      SELECT net.http_post(
        url := 'https://shopbox-share-and-sell.lovable.app/api/public/cielo/reconcile',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', %L
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 30000
      );
    $job$, v_cron_secret)
  );

  PERFORM cron.unschedule('cielo-refund-retry');
  PERFORM cron.schedule(
    'cielo-refund-retry',
    '17 * * * *',
    format($job$
      SELECT net.http_post(
        url := 'https://shopbox-share-and-sell.lovable.app/api/public/hooks/cielo-refund-retry',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', %L
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 30000
      );
    $job$, v_cron_secret)
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Falha ao reagendar crons Cielo: %', SQLERRM;
END $$;
