-- Security hardening from a full-codebase review:
--   1. Drop TRUNCATE/REFERENCES/TRIGGER from API roles (RLS does not govern
--      TRUNCATE; PostgREST never issues these, but least privilege anyway).
--   2. Profiles are visible only to yourself and people you share a space
--      with — previously any signed-in user could enumerate all emails.
--   3. Space invites expire 14 days after they are issued.

-- 1 ── table privileges ------------------------------------------------------
revoke truncate, references, trigger on all tables in schema public from authenticated;
alter default privileges in schema public
  revoke truncate, references, trigger on tables from authenticated;

-- 2 ── profiles visibility ---------------------------------------------------
-- SECURITY DEFINER (like is_space_member) so the policy can read
-- space_members without recursing through its own policies.
create or replace function public.shares_space_with(target uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select target = auth.uid() or exists (
    select 1
    from public.space_members mine
    join public.space_members theirs on mine.space_id = theirs.space_id
    where mine.user_id = auth.uid() and theirs.user_id = target
  );
$$;

revoke execute on function public.shares_space_with(uuid) from public, anon;
grant execute on function public.shares_space_with(uuid) to authenticated;

drop policy profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (public.shares_space_with(id));

-- 3 ── invite expiry ---------------------------------------------------------
create or replace function public.accept_space_invite(invite_token uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inv record;
begin
  select * into inv from public.space_invites
  where token = invite_token
    and accepted_at is null
    and created_at > now() - interval '14 days';
  if inv is null then
    raise exception 'Invite not found, expired, or already used';
  end if;

  insert into public.space_members (space_id, user_id, role)
  values (inv.space_id, auth.uid(), 'member')
  on conflict do nothing;

  update public.space_invites set accepted_at = now() where id = inv.id;
  return inv.space_id;
end;
$$;
