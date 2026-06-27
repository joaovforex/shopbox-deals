
-- Perfil: campos adicionais para reuso em compras
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS address_zip text,
  ADD COLUMN IF NOT EXISTS address_street text,
  ADD COLUMN IF NOT EXISTS address_number text,
  ADD COLUMN IF NOT EXISTS address_complement text,
  ADD COLUMN IF NOT EXISTS address_district text,
  ADD COLUMN IF NOT EXISTS address_city text,
  ADD COLUMN IF NOT EXISTS address_state text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS profiles_touch_updated_at ON public.profiles;
CREATE TRIGGER profiles_touch_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Permite o próprio usuário criar seu profile se faltar (handle_new_user já cria, mas defensivo)
DROP POLICY IF EXISTS "Profiles insert by self" ON public.profiles;
CREATE POLICY "Profiles insert by self" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

-- Pedidos: registrar motivo real da resposta do Mercado Pago
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS mp_payment_status text,
  ADD COLUMN IF NOT EXISTS mp_status_detail text,
  ADD COLUMN IF NOT EXISTS mp_payment_method_id text,
  ADD COLUMN IF NOT EXISTS mp_last_attempt_at timestamptz;
