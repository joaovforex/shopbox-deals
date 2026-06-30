
-- 1) process-email-queue: 5s -> 15s (mantém o mesmo comando)
SELECT cron.unschedule('process-email-queue');
SELECT cron.schedule(
  'process-email-queue',
  '15 seconds',
  $cmd$
  SELECT CASE
    WHEN (SELECT retry_after_until FROM public.email_send_state WHERE id = 1) > now()
      THEN NULL
    WHEN EXISTS (SELECT 1 FROM pgmq.q_auth_emails LIMIT 1)
      OR EXISTS (SELECT 1 FROM pgmq.q_transactional_emails LIMIT 1)
      THEN net.http_post(
        url := 'https://project--c4f78e45-fe9f-4685-9b8e-5d44272c204b.lovable.app/lovable/email/queue/process',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Lovable-Context', 'cron',
          'Authorization', 'Bearer ' || (
            SELECT decrypted_secret FROM vault.decrypted_secrets
            WHERE name = 'email_queue_service_role_key'
          )
        ),
        body := '{}'::jsonb
      )
    ELSE NULL
  END;
  $cmd$
);

-- 2) reconcile-mp-orders: */5 -> */15
SELECT cron.unschedule('reconcile-mp-orders');
SELECT cron.schedule(
  'reconcile-mp-orders',
  '*/15 * * * *',
  $cmd$
  SELECT net.http_post(
    url := 'https://shopbox-share-and-sell.lovable.app/api/public/reconcile-orders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT value FROM public.app_secrets WHERE name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $cmd$
);

-- 3) Fundir os 2 jobs de expiração em 1, rodando a cada 2 min
SELECT cron.unschedule('expire-cart-reservations');
SELECT cron.unschedule('expire-stale-pending-orders');
SELECT cron.schedule(
  'expire-cart-and-pending',
  '*/2 * * * *',
  $cmd$
  SELECT public.expire_cart_reservations();
  SELECT public.expire_stale_pending_orders(5);
  $cmd$
);
