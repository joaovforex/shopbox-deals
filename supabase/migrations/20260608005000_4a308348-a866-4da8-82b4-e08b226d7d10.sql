
alter function public.handle_new_user() set search_path = public;
alter function public.touch_updated_at() set search_path = public;

revoke execute on function public.has_role(uuid, app_role) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
