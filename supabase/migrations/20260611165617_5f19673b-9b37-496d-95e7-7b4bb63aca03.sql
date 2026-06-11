CREATE OR REPLACE FUNCTION public.search_team_candidates(p_term text)
RETURNS TABLE(id uuid, full_name text, email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_term text := trim(coalesce(p_term, ''));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  IF length(v_term) < 2 OR length(v_term) > 120 THEN
    RAISE EXCEPTION 'Termo inválido';
  END IF;

  RETURN QUERY
  SELECT u.id,
         nullif(p.full_name, '') AS full_name,
         u.email::text AS email
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
   WHERE coalesce(p.full_name, '') ILIKE '%' || v_term || '%'
      OR coalesce(u.email, '') ILIKE '%' || v_term || '%'
   ORDER BY coalesce(nullif(p.full_name, ''), u.email, u.id::text)
   LIMIT 10;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_team_candidates(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.assign_team_role(p_user_id uuid, p_role public.app_role)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário obrigatório';
  END IF;

  IF p_role NOT IN ('admin', 'catalog', 'fulfillment') THEN
    RAISE EXCEPTION 'Função inválida';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'Usuário não encontrado';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_user_id, p_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  IF NOT FOUND THEN
    RETURN 'duplicate';
  END IF;

  RETURN 'ok';
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_team_role(uuid, public.app_role) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_team_role(p_user_id uuid, p_role public.app_role)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário obrigatório';
  END IF;

  IF p_role NOT IN ('admin', 'catalog', 'fulfillment') THEN
    RAISE EXCEPTION 'Função inválida';
  END IF;

  DELETE FROM public.user_roles
   WHERE user_id = p_user_id
     AND role = p_role;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_team_role(uuid, public.app_role) TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_first_admin_if_none()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    RETURN false;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_uid, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_first_admin_if_none() TO authenticated;