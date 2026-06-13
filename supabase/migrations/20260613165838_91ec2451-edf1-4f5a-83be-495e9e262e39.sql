
-- 1) Novo papel "manager" (ADM = catálogo + expedição)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'manager';

-- 2) Policies para o papel manager (usando has_role_name para evitar enum-lock no mesmo migration)

-- products
CREATE POLICY "Manager can insert products"
  ON public.products FOR INSERT TO authenticated
  WITH CHECK (public.has_role_name(auth.uid(), 'manager'));

CREATE POLICY "Manager can update products"
  ON public.products FOR UPDATE TO authenticated
  USING (public.has_role_name(auth.uid(), 'manager'));

CREATE POLICY "Manager can delete products"
  ON public.products FOR DELETE TO authenticated
  USING (public.has_role_name(auth.uid(), 'manager'));

-- storage: product-images
CREATE POLICY "Manager can upload product images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-images' AND public.has_role_name(auth.uid(), 'manager'));

CREATE POLICY "Manager can update product images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'product-images' AND public.has_role_name(auth.uid(), 'manager'));

CREATE POLICY "Manager can delete product images"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'product-images' AND public.has_role_name(auth.uid(), 'manager'));

-- orders / order_items (mesmo nível do papel fulfillment)
CREATE POLICY "Manager can view orders"
  ON public.orders FOR SELECT TO authenticated
  USING (public.has_role_name(auth.uid(), 'manager'));

CREATE POLICY "Manager can update orders"
  ON public.orders FOR UPDATE TO authenticated
  USING (public.has_role_name(auth.uid(), 'manager'));

CREATE POLICY "Manager can view order items"
  ON public.order_items FOR SELECT TO authenticated
  USING (public.has_role_name(auth.uid(), 'manager'));

-- 3) Atualiza assign/remove para aceitar o novo papel
CREATE OR REPLACE FUNCTION public.assign_team_role(p_user_id uuid, p_role app_role)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF NOT public.has_role(v_uid, 'admin') THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'Usuário obrigatório'; END IF;
  IF p_role::text NOT IN ('admin','manager','catalog','fulfillment') THEN
    RAISE EXCEPTION 'Função inválida';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'Usuário não encontrado';
  END IF;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_user_id, p_role)
  ON CONFLICT (user_id, role) DO NOTHING;
  IF NOT FOUND THEN RETURN 'duplicate'; END IF;
  RETURN 'ok';
END;
$function$;

CREATE OR REPLACE FUNCTION public.remove_team_role(p_user_id uuid, p_role app_role)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF NOT public.has_role(v_uid, 'admin') THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'Usuário obrigatório'; END IF;
  IF p_role::text NOT IN ('admin','manager','catalog','fulfillment') THEN
    RAISE EXCEPTION 'Função inválida';
  END IF;
  DELETE FROM public.user_roles WHERE user_id = p_user_id AND role = p_role;
  RETURN true;
END;
$function$;
