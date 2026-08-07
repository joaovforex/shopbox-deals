SELECT cron.unschedule('reconcile-mp-orders');
SELECT cron.unschedule('reconcile-cielo-orders');
SELECT cron.schedule(
  'reconcile-asaas-orders',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://shopbox-share-and-sell.lovable.app/api/public/asaas/reconcile',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT value FROM public.app_secrets WHERE name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);