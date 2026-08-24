update public.site_settings set payment_provider = 'cielo', updated_at = now() where id = 1;

select cron.schedule(
  'reconcile-cielo-orders',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://shopbox-share-and-sell.lovable.app/api/public/cielo/reconcile',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select value from public.app_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);