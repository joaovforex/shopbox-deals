-- EXECUÇÃO MANUAL.
-- Pré-condição: https://shopboxonline.com deve estar validado na nova
-- hospedagem, com os mesmos segredos e endpoints respondendo corretamente.

BEGIN;

DO $$
DECLARE
  job record;
  new_command text;
BEGIN
  FOR job IN
    SELECT jobname, schedule, command
    FROM cron.job
    WHERE command LIKE '%shopbox-share-and-sell.lovable.app%'
       OR command LIKE '%project--c4f78e45-fe9f-4685-9b8e-5d44272c204b.lovable.app%'
  LOOP
    new_command := replace(
      replace(
        job.command,
        'https://shopbox-share-and-sell.lovable.app',
        'https://shopboxonline.com'
      ),
      'https://project--c4f78e45-fe9f-4685-9b8e-5d44272c204b.lovable.app',
      'https://shopboxonline.com'
    );

    PERFORM cron.schedule(job.jobname, job.schedule, new_command);
  END LOOP;
END
$$;

COMMIT;

-- Conferência sem exibir comandos ou segredos:
SELECT jobname, schedule, active
FROM cron.job
WHERE command LIKE '%shopboxonline.com%'
ORDER BY jobname;
