-- ============================================================
-- TBT Express / Mais Entregas — correções (29/09/2026)
-- Rodar no SQL Editor do Supabase de PRODUÇÃO (projeto ivvghjzzhldcvzxaxwty).
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================

-- 1) Endereço e telefone de COLETA editáveis no painel (/admin/configuracoes).
--    Vazio = o servidor usa o padrão (Rua Emílio Gleber, 1118 — Colombo).
ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS pickup_zip        text,
  ADD COLUMN IF NOT EXISTS pickup_street     text,
  ADD COLUMN IF NOT EXISTS pickup_number     text,
  ADD COLUMN IF NOT EXISTS pickup_complement text,
  ADD COLUMN IF NOT EXISTS pickup_district   text,
  ADD COLUMN IF NOT EXISTS pickup_city       text,
  ADD COLUMN IF NOT EXISTS pickup_state      text,
  ADD COLUMN IF NOT EXISTS pickup_phone      text,
  ADD COLUMN IF NOT EXISTS pickup_name       text;

-- Preenche com o endereço atual para aparecer no formulário (telefone fica
-- para o João preencher no painel).
UPDATE public.site_settings
   SET pickup_zip      = COALESCE(NULLIF(pickup_zip, ''), '83408290'),
       pickup_street   = COALESCE(NULLIF(pickup_street, ''), 'Rua Emílio Gleber'),
       pickup_number   = COALESCE(NULLIF(pickup_number, ''), '1118'),
       pickup_district = COALESCE(NULLIF(pickup_district, ''), 'Atuba'),
       pickup_city     = COALESCE(NULLIF(pickup_city, ''), 'Colombo'),
       pickup_state    = COALESCE(NULLIF(pickup_state, ''), 'PR'),
       pickup_name     = COALESCE(NULLIF(pickup_name, ''), 'Shopbox')
 WHERE id = 1;

-- 2) Status antigos gravados como texto cru da API → forma normalizada.
--    ("Serviço Finalizado" → 'entregue'; "Contatando Parceiro" → 'contatando_parceiro' etc.)
CREATE OR REPLACE FUNCTION public.me_normalize_status(raw text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE s
    WHEN 'servico_finalizado' THEN 'entregue'
    WHEN 'finalizado'         THEN 'entregue'
    WHEN 'concluido'          THEN 'entregue'
    WHEN 'cancelada'          THEN 'cancelado'
    WHEN 'cancelled'          THEN 'cancelado'
    WHEN 'canceled'           THEN 'cancelado'
    WHEN 'devolvida'          THEN 'devolvido'
    ELSE s END
  FROM (
    SELECT regexp_replace(
             lower(btrim(translate(coalesce(raw, ''),
               'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
               'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'))),
             '[\s-]+', '_', 'g') AS s
  ) t;
$$;

UPDATE public.orders
   SET maisentregas_status = public.me_normalize_status(maisentregas_status)
 WHERE maisentregas_status IS NOT NULL
   AND maisentregas_status <> public.me_normalize_status(maisentregas_status);

-- 3) Entregues sem data de entrega: usa a última checagem como aproximação
--    (a partir de agora o cron grava a hora real vinda da API).
UPDATE public.orders
   SET delivered_at = COALESCE(delivered_at, maisentregas_last_check_at, updated_at, created_at)
 WHERE maisentregas_status = 'entregue'
   AND delivered_at IS NULL;

-- 4) Destrava as corridas marcadas "[sem-acesso]" por causa do 401 no /auth
--    (queda de credencial de 01/09). Elas voltam a ser consultadas pelo cron;
--    as que realmente forem de outra conta serão marcadas de novo, mas só
--    pelo erro "não tem acesso" — nunca mais por falha de login global.
UPDATE public.orders
   SET maisentregas_last_error = NULL
 WHERE maisentregas_last_error ILIKE '[sem-acesso]%'
   AND maisentregas_last_error ILIKE '%/auth%';

-- 5) Link de acompanhamento para corridas ativas (o cron também grava).
UPDATE public.orders
   SET maisentregas_tracking_url = '/rastreio/' || id::text
 WHERE maisentregas_order_id IS NOT NULL
   AND maisentregas_tracking_url IS NULL
   AND (maisentregas_status IS NULL OR maisentregas_status NOT IN ('entregue','cancelado','devolvido'));

-- Conferência
SELECT maisentregas_status, count(*) AS qtd,
       count(*) FILTER (WHERE maisentregas_last_error ILIKE '[sem-acesso]%') AS sem_acesso,
       count(*) FILTER (WHERE delivered_at IS NOT NULL) AS com_delivered_at
  FROM public.orders
 WHERE maisentregas_order_id IS NOT NULL
 GROUP BY 1 ORDER BY 2 DESC;
