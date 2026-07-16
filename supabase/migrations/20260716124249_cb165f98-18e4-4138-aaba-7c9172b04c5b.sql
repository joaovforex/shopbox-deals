
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove agendamento anterior se existir (idempotência)
DO $$
BEGIN
  PERFORM cron.unschedule('reconcile-cielo-orders');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'reconcile-cielo-orders',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--c4f78e45-fe9f-4685-9b8e-5d44272c204b.lovable.app/api/public/cielo/reconcile',
    headers := '{"Content-Type":"application/json","apikey":"sb_publishable_xgmfIVdmGzeuhgQMeXJirA_w2lKV3j0"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
