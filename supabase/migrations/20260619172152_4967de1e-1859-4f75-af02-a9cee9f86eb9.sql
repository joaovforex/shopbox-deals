CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove versão anterior se existir (idempotente)
DO $$
BEGIN
  PERFORM cron.unschedule('reconcile-mp-orders');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'reconcile-mp-orders',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://shopbox-share-and-sell.lovable.app/api/public/reconcile-orders',
    headers := '{"Content-Type": "application/json", "apikey": "sb_publishable_xgmfIVdmGzeuhgQMeXJirA_w2lKV3j0"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);