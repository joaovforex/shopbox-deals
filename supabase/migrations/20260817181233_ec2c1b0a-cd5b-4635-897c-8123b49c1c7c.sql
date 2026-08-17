CREATE TABLE IF NOT EXISTS public.unidades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  slug text UNIQUE,
  cep text,
  rua text,
  numero text,
  complemento text,
  bairro text,
  cidade text DEFAULT 'Curitiba',
  estado text DEFAULT 'PR',
  horario_retirada text,
  ativa boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.unidades TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.unidades TO authenticated;
GRANT ALL ON public.unidades TO service_role;

ALTER TABLE public.unidades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Unidades são públicas para leitura" ON public.unidades;
CREATE POLICY "Unidades são públicas para leitura"
  ON public.unidades FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Admin/manager podem inserir unidades" ON public.unidades;
CREATE POLICY "Admin/manager podem inserir unidades"
  ON public.unidades FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role_name(auth.uid(), 'manager'));

DROP POLICY IF EXISTS "Admin/manager podem atualizar unidades" ON public.unidades;
CREATE POLICY "Admin/manager podem atualizar unidades"
  ON public.unidades FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role_name(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role_name(auth.uid(), 'manager'));

DROP POLICY IF EXISTS "Admin/manager podem excluir unidades" ON public.unidades;
CREATE POLICY "Admin/manager podem excluir unidades"
  ON public.unidades FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role_name(auth.uid(), 'manager'));

INSERT INTO public.unidades (nome, slug, cep, rua, numero, bairro, cidade, estado, horario_retirada, ativa, ordem)
VALUES ('Atuba', 'atuba', NULL, 'Rua Emílio Gleber', '1118', 'Atuba', 'Colombo', 'PR', 'Seg a Sáb · 9h às 18h · Dom · 10h às 16h', true, 1)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.unidades (nome, slug, cidade, estado, ativa, ordem)
VALUES ('Unidade 2', 'unidade-2', 'Curitiba', 'PR', true, 2),
       ('Unidade 3', 'unidade-3', 'Curitiba', 'PR', true, 3),
       ('Unidade 4', 'unidade-4', 'Curitiba', 'PR', true, 4)
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS unidade_id uuid REFERENCES public.unidades(id);

UPDATE public.products
SET unidade_id = (SELECT id FROM public.unidades WHERE slug = 'atuba')
WHERE unidade_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_products_unidade_id ON public.products(unidade_id);