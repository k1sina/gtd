-- Creating a space must bootstrap its first membership: the creator can't
-- insert into space_members themselves (the RLS policy requires being an
-- owner already), so a SECURITY DEFINER trigger adds them.

create or replace function public.handle_new_space()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.space_members (space_id, user_id, role)
  values (new.id, new.created_by, 'owner')
  on conflict do nothing;
  return new;
end;
$$;

create trigger on_space_created
  after insert on public.spaces
  for each row execute function public.handle_new_space();

-- INSERT ... RETURNING evaluates the SELECT policy before the AFTER trigger
-- has created the owner membership — so creators must be able to see their
-- own spaces directly.
create policy spaces_select_own on public.spaces
  for select to authenticated using (created_by = auth.uid());

-- PostgREST can only embed profiles behind an explicit foreign key.
alter table public.space_members
  add constraint space_members_user_profile_fkey
  foreign key (user_id) references public.profiles (id) on delete cascade;

alter table public.task_comments
  add constraint task_comments_user_profile_fkey
  foreign key (user_id) references public.profiles (id) on delete cascade;

-- handle_new_user also inserts the personal-space membership; now that the
-- space trigger does it first, that insert must tolerate the conflict.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_space_id uuid;
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(coalesce(new.email, ''), '@', 1))
  );

  insert into public.spaces (name, is_personal, created_by)
  values ('Personal', true, new.id)
  returning id into new_space_id;

  insert into public.space_members (space_id, user_id, role)
  values (new_space_id, new.id, 'owner')
  on conflict do nothing;

  return new;
end;
$$;
