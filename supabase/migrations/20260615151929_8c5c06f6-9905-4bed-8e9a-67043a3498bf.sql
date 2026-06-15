
-- Add phone and CPF to profiles for client self-registration
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS cpf text;

-- Update handle_new_user to also store phone/cpf from metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
begin
  insert into public.profiles (id, full_name, phone, cpf)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    nullif(regexp_replace(coalesce(new.raw_user_meta_data->>'phone', ''), '\D', '', 'g'), ''),
    nullif(regexp_replace(coalesce(new.raw_user_meta_data->>'cpf', ''), '\D', '', 'g'), '')
  )
  on conflict (id) do update set
    full_name = coalesce(nullif(EXCLUDED.full_name, ''), public.profiles.full_name),
    phone     = coalesce(EXCLUDED.phone, public.profiles.phone),
    cpf       = coalesce(EXCLUDED.cpf, public.profiles.cpf);
  insert into public.user_roles (user_id, role) values (new.id, 'user')
    on conflict (user_id, role) do nothing;
  return new;
end;
$$;

-- Allow Catalog role to also view orders (for the order search/expedition aux)
DROP POLICY IF EXISTS "Catalog can view orders" ON public.orders;
CREATE POLICY "Catalog can view orders" ON public.orders
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'catalog'::app_role));

-- Index for CPF search
CREATE INDEX IF NOT EXISTS orders_customer_cpf_idx ON public.orders (customer_cpf);
CREATE INDEX IF NOT EXISTS orders_customer_name_lower_idx ON public.orders (lower(customer_name));
