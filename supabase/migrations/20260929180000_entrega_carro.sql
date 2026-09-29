-- ============================================================
-- Entrega de CARRO (Fiorino) para produtos grandes — 29/09/2026
-- Rodar no SQL Editor do Supabase de PRODUÇÃO (ivvghjzzhldcvzxaxwty),
-- DEPOIS do migracao_tbt_correcoes.sql. Idempotente.
-- ============================================================

-- 1) Produto que precisa de carro (não cabe na moto)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS requires_car boolean NOT NULL DEFAULT false;

-- 2) Veículo usado no pedido ('moto' | 'carro') e origem do preço do frete
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_vehicle text NOT NULL DEFAULT 'moto',
  ADD COLUMN IF NOT EXISTS delivery_fee_source text;  -- 'api' | 'tabela'

DO $$ BEGIN
  ALTER TABLE public.orders
    ADD CONSTRAINT orders_delivery_vehicle_chk CHECK (delivery_vehicle IN ('moto','carro'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3) Configuração da entrega de carro (painel /admin/configuracoes)
--    car_me_city  : código do serviço/cidade de CARRO na TBT (Mais Entregas).
--                   Preenchido = cotação e corrida automáticas pela API.
--    car_me_extra : campos extras enviados SÓ nas corridas de carro (JSON),
--                   para o caso de a TBT pedir um campo específico de veículo.
--    car_fee_table: tabela de frete por cidade usada enquanto não houver
--                   car_me_city (ex.: {"curitiba": 60, "colombo": 50}).
--    car_fee_default: valor para cidades atendidas que não estão na tabela.
ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS car_delivery_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS car_me_city     text,
  ADD COLUMN IF NOT EXISTS car_me_extra    jsonb,
  ADD COLUMN IF NOT EXISTS car_fee_table   jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS car_fee_default numeric(10,2);

-- 4) Importação por planilha: aceita a coluna requires_car
CREATE OR REPLACE FUNCTION public.admin_update_product_fields(p_id uuid, p_fields jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.admin_can_manage_products(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  UPDATE public.products p
     SET name = COALESCE(NULLIF(p_fields->>'name', ''), p.name),
         description = COALESCE(p_fields->>'description', p.description),
         category = COALESCE(NULLIF(p_fields->>'category', ''), p.category),
         brand = COALESCE(NULLIF(p_fields->>'brand', ''), p.brand),
         size = COALESCE(NULLIF(p_fields->>'size', ''), p.size),
         price = COALESCE((p_fields->>'price')::numeric, p.price),
         original_price = COALESCE((p_fields->>'original_price')::numeric, p.original_price),
         stock = COALESCE((p_fields->>'stock')::integer, p.stock),
         requires_car = COALESCE((p_fields->>'requires_car')::boolean, p.requires_car),
         updated_at = now()
   WHERE p.id = p_id;

  PERFORM public.log_admin_action('update_product_fields', 'products', p_id::text,
    jsonb_build_object('affected', CASE WHEN FOUND THEN 1 ELSE 0 END,
                       'fields', (SELECT jsonb_agg(k) FROM jsonb_object_keys(COALESCE(p_fields,'{}'::jsonb)) k)));
  RETURN FOUND;
END;
$function$;

-- 5) Ação em massa: marcar/desmarcar "precisa de carro"
CREATE OR REPLACE FUNCTION public.admin_set_products_requires_car(p_ids uuid[], p_value boolean)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  affected integer;
BEGIN
  IF NOT public.admin_can_manage_products(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  UPDATE public.products
     SET requires_car = COALESCE(p_value, false), updated_at = now()
   WHERE id = ANY(p_ids);
  GET DIAGNOSTICS affected = ROW_COUNT;
  PERFORM public.log_admin_action('set_requires_car', 'products', NULL,
    jsonb_build_object('affected', affected, 'value', p_value));
  RETURN affected;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_set_products_requires_car(uuid[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_products_requires_car(uuid[], boolean) TO authenticated;

-- Conferência
SELECT
  (SELECT count(*) FROM public.products WHERE requires_car) AS produtos_carro,
  (SELECT car_delivery_enabled FROM public.site_settings WHERE id = 1) AS carro_ativo,
  (SELECT car_me_city FROM public.site_settings WHERE id = 1) AS servico_carro_tbt;
