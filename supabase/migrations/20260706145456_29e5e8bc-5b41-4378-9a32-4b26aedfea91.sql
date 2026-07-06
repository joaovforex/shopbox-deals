
-- =========================================================
-- 1) TABELA fiscal_config (singleton por loja)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.fiscal_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ativo BOOLEAN NOT NULL DEFAULT false,
  ambiente TEXT NOT NULL DEFAULT 'homologacao' CHECK (ambiente IN ('homologacao','producao')),

  cnpj TEXT,
  inscricao_estadual TEXT,
  inscricao_municipal TEXT,
  razao_social TEXT,
  nome_fantasia TEXT,
  regime_tributario TEXT CHECK (regime_tributario IN ('simples','presumido','real')),

  endereco_logradouro TEXT,
  endereco_numero TEXT,
  endereco_complemento TEXT,
  endereco_bairro TEXT,
  endereco_municipio TEXT,
  endereco_uf TEXT,
  endereco_cep TEXT,
  endereco_codigo_municipio TEXT,  -- código IBGE

  csc_id TEXT,
  csc_token TEXT,

  serie_nfce INTEGER NOT NULL DEFAULT 1,
  serie_nfe  INTEGER NOT NULL DEFAULT 1,

  cfop_padrao_dentro_uf TEXT NOT NULL DEFAULT '5102',
  cfop_padrao_fora_uf   TEXT NOT NULL DEFAULT '6102',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fiscal_config TO authenticated;
GRANT ALL ON public.fiscal_config TO service_role;

ALTER TABLE public.fiscal_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins podem ler fiscal_config"
  ON public.fiscal_config FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins podem inserir fiscal_config"
  ON public.fiscal_config FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins podem atualizar fiscal_config"
  ON public.fiscal_config FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins podem apagar fiscal_config"
  ON public.fiscal_config FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Trigger para updated_at (usa função genérica se já existir; senão cria)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fiscal_config_updated_at ON public.fiscal_config;
CREATE TRIGGER trg_fiscal_config_updated_at
  BEFORE UPDATE ON public.fiscal_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Cria a linha singleton se não existir
INSERT INTO public.fiscal_config (ativo, ambiente)
SELECT false, 'homologacao'
WHERE NOT EXISTS (SELECT 1 FROM public.fiscal_config);

-- =========================================================
-- 2) COLUNAS FISCAIS em products
-- =========================================================
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS ncm TEXT,
  ADD COLUMN IF NOT EXISTS cest TEXT,
  ADD COLUMN IF NOT EXISTS cfop TEXT,
  ADD COLUMN IF NOT EXISTS origem SMALLINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cst_csosn TEXT,
  ADD COLUMN IF NOT EXISTS unidade_comercial TEXT NOT NULL DEFAULT 'UN',
  ADD COLUMN IF NOT EXISTS peso_liquido NUMERIC(10,3);

-- =========================================================
-- 3) COLUNAS FISCAIS em orders
-- =========================================================
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS nfe_modelo TEXT CHECK (nfe_modelo IN ('nfce','nfe')),
  ADD COLUMN IF NOT EXISTS nfe_status TEXT DEFAULT 'pending'
    CHECK (nfe_status IN ('pending','processing','authorized','rejected','cancelled','skipped')),
  ADD COLUMN IF NOT EXISTS nfe_ref TEXT,
  ADD COLUMN IF NOT EXISTS nfe_numero TEXT,
  ADD COLUMN IF NOT EXISTS nfe_serie TEXT,
  ADD COLUMN IF NOT EXISTS nfe_chave TEXT,
  ADD COLUMN IF NOT EXISTS nfe_protocolo TEXT,
  ADD COLUMN IF NOT EXISTS nfe_authorized_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS nfe_xml_url TEXT,
  ADD COLUMN IF NOT EXISTS nfe_danfe_url TEXT,
  ADD COLUMN IF NOT EXISTS nfe_rejection_message TEXT,
  ADD COLUMN IF NOT EXISTS nfe_last_check_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS destinatario_cpf_cnpj TEXT,
  ADD COLUMN IF NOT EXISTS destinatario_nome TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS orders_nfe_ref_key
  ON public.orders (nfe_ref) WHERE nfe_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS orders_nfe_status_idx
  ON public.orders (nfe_status) WHERE nfe_status IN ('pending','processing');
