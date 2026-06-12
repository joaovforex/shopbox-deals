DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;
REVOKE USAGE ON SCHEMA app_private FROM authenticated;
REVOKE EXECUTE ON FUNCTION app_private.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;