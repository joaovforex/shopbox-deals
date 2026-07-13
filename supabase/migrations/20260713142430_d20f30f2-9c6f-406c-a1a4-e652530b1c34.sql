-- Impede que qualquer usuário autenticado consulte o cashback de outro
-- passando um UUID diferente. Mantém SECURITY DEFINER (necessário para
-- ler cashback_entries sem depender de RLS específica) mas exige que o
-- p_user_id corresponda ao auth.uid() OU que o chamador seja admin.

CREATE OR REPLACE FUNCTION public.cashback_balance(p_user_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;
  IF p_user_id IS DISTINCT FROM v_uid AND NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  RETURN (
    SELECT COALESCE(SUM(amount - consumed), 0)::numeric(10,2)
      FROM public.cashback_entries
     WHERE user_id = p_user_id
       AND kind = 'earn'
       AND expired_at IS NULL
       AND (expires_at IS NULL OR expires_at > now())
       AND amount > consumed
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.cashback_next_expiry(p_user_id uuid)
 RETURNS TABLE(amount numeric, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;
  IF p_user_id IS DISTINCT FROM v_uid AND NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  RETURN QUERY
    SELECT (e.amount - e.consumed)::numeric(10,2), e.expires_at
      FROM public.cashback_entries e
     WHERE e.user_id = p_user_id
       AND e.kind = 'earn'
       AND e.expired_at IS NULL
       AND e.expires_at IS NOT NULL
       AND e.expires_at > now()
       AND e.amount > e.consumed
     ORDER BY e.expires_at ASC
     LIMIT 1;
END;
$function$;

-- Reafirma o mesmo modelo de permissão anterior: apenas authenticated executa.
REVOKE EXECUTE ON FUNCTION public.cashback_balance(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.cashback_next_expiry(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.cashback_balance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cashback_next_expiry(uuid) TO authenticated;