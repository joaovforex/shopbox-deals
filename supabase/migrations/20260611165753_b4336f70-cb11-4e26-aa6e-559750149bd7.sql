REVOKE EXECUTE ON FUNCTION public.search_team_candidates(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.assign_team_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.remove_team_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.claim_first_admin_if_none() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.search_team_candidates(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_team_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_team_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_first_admin_if_none() TO authenticated;