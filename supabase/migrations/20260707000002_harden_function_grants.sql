-- Lock down function execution surfaced by the Supabase security advisor.
-- Functions default to EXECUTE for PUBLIC, so per-role revokes alone are not
-- enough: revoke PUBLIC, then grant back only what the app needs.

revoke execute on function public.is_space_member(uuid) from public, anon;
revoke execute on function public.is_space_owner(uuid) from public, anon;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_new_space() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.accept_space_invite(uuid) from public, anon;

-- RLS policies evaluate the membership helpers as the authenticated role,
-- and signed-in users call accept_space_invite via RPC. (Triggers run as the
-- table owner and need no API-role grants.)
grant execute on function public.is_space_member(uuid) to authenticated;
grant execute on function public.is_space_owner(uuid) to authenticated;
grant execute on function public.accept_space_invite(uuid) to authenticated;

-- Pin search_path on the remaining function flagged by the linter.
alter function public.set_updated_at() set search_path = public;
