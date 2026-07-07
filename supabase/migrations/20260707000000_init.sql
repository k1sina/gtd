-- GTD app: full schema, RLS, triggers.
-- Tables for later phases (calendar, chat, collaboration) are created up
-- front so the data model stays stable across phases.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text not null default '',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Spaces (sharing boundary) + membership + invites
-- ---------------------------------------------------------------------------
create table public.spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_personal boolean not null default false,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.space_members (
  space_id uuid not null references public.spaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (space_id, user_id)
);

create table public.space_invites (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  email text not null,
  token uuid not null default gen_random_uuid() unique,
  invited_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

-- Membership check used by nearly every policy. SECURITY DEFINER so policies
-- on space_members itself don't recurse.
create or replace function public.is_space_member(sid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.space_members
    where space_id = sid and user_id = auth.uid()
  );
$$;

create or replace function public.is_space_owner(sid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.space_members
    where space_id = sid and user_id = auth.uid() and role = 'owner'
  );
$$;

-- ---------------------------------------------------------------------------
-- Horizons: values -> goals -> areas -> projects -> tasks
-- ---------------------------------------------------------------------------
create table public.life_values (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  description text,
  sort_order double precision not null default 0,
  created_at timestamptz not null default now()
);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  value_id uuid references public.life_values (id) on delete set null,
  title text not null,
  description text,
  year int not null,
  quarter int not null check (quarter between 1 and 4),
  status text not null default 'active'
    check (status in ('active', 'achieved', 'partial', 'dropped')),
  score int check (score between 0 and 10),
  reflection text,
  sort_order double precision not null default 0,
  created_at timestamptz not null default now()
);

create table public.areas (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  name text not null,
  color text,
  sort_order double precision not null default 0,
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  area_id uuid references public.areas (id) on delete set null,
  goal_id uuid references public.goals (id) on delete set null,
  name text not null,
  outcome text,
  status text not null default 'active'
    check (status in ('active', 'someday', 'on_hold', 'completed', 'archived')),
  sort_order double precision not null default 0,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  parent_task_id uuid references public.tasks (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  assigned_to uuid references auth.users (id) on delete set null,
  title text not null,
  notes text,
  status text not null default 'inbox'
    check (status in ('inbox', 'next', 'waiting', 'scheduled', 'someday', 'done', 'cancelled')),
  urgency int not null default 2 check (urgency between 1 and 4),
  importance int not null default 2 check (importance between 1 and 4),
  due_at timestamptz,
  defer_until timestamptz,
  estimated_minutes int,
  energy text check (energy in ('low', 'medium', 'high')),
  context_tags text[] not null default '{}',
  waiting_on text,
  recurrence_rule text,
  recurrence_parent_id uuid references public.tasks (id) on delete set null,
  sort_order double precision not null default 0,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search tsvector generated always as (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(notes, ''))
  ) stored
);

create index tasks_space_status_idx on public.tasks (space_id, status);
create index tasks_project_idx on public.tasks (project_id);
create index tasks_parent_idx on public.tasks (parent_task_id);
create index tasks_due_idx on public.tasks (due_at);
create index tasks_search_idx on public.tasks using gin (search);
create index projects_space_idx on public.projects (space_id, status);

-- ---------------------------------------------------------------------------
-- Habits
-- ---------------------------------------------------------------------------
create table public.habits (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  name text not null,
  weekdays int[] not null default '{}', -- 0 = Monday .. 6 = Sunday; empty = daily
  sort_order double precision not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.habit_logs (
  habit_id uuid not null references public.habits (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  log_date date not null,
  created_at timestamptz not null default now(),
  primary key (habit_id, user_id, log_date)
);

create index habit_logs_user_date_idx on public.habit_logs (user_id, log_date);

-- ---------------------------------------------------------------------------
-- Reviews (weekly + quarterly)
-- ---------------------------------------------------------------------------
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (type in ('weekly', 'quarterly')),
  period_start date not null,
  period_end date not null,
  checklist jsonb not null default '{}',
  notes text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, type, period_start)
);

-- ---------------------------------------------------------------------------
-- Calendar integration (Phase 3)
-- ---------------------------------------------------------------------------
create table public.calendar_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null default 'google',
  email text not null,
  access_token text not null,
  refresh_token text not null,
  token_expires_at timestamptz,
  calendar_id text not null default 'primary',
  settings jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (user_id, provider, email)
);

create table public.time_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete cascade,
  calendar_event_id text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'suggested'
    check (status in ('suggested', 'confirmed', 'synced', 'cancelled')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- AI chat (Phase 4)
-- ---------------------------------------------------------------------------
create table public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'New conversation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chat_sessions (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content jsonb not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Collaboration (Phase 5)
-- ---------------------------------------------------------------------------
create table public.task_comments (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- New auth user -> profile + personal space + owner membership.
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
  values (new_space_id, new.id, 'owner');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger tasks_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

create trigger chat_sessions_updated_at
  before update on public.chat_sessions
  for each row execute function public.set_updated_at();

-- Accept an invite by token: adds the caller to the space.
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
  where token = invite_token and accepted_at is null;
  if inv is null then
    raise exception 'Invite not found or already used';
  end if;

  insert into public.space_members (space_id, user_id, role)
  values (inv.space_id, auth.uid(), 'member')
  on conflict do nothing;

  update public.space_invites set accepted_at = now() where id = inv.id;
  return inv.space_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.spaces enable row level security;
alter table public.space_members enable row level security;
alter table public.space_invites enable row level security;
alter table public.life_values enable row level security;
alter table public.goals enable row level security;
alter table public.areas enable row level security;
alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.habits enable row level security;
alter table public.habit_logs enable row level security;
alter table public.reviews enable row level security;
alter table public.calendar_accounts enable row level security;
alter table public.time_blocks enable row level security;
alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;
alter table public.task_comments enable row level security;
alter table public.activity_log enable row level security;

-- Profiles: any signed-in user may read (needed to display collaborator
-- names); only the owner may change their profile.
create policy profiles_select on public.profiles
  for select to authenticated using (true);
create policy profiles_update on public.profiles
  for update to authenticated using (id = auth.uid());

-- Spaces.
create policy spaces_select on public.spaces
  for select to authenticated using (public.is_space_member(id));
create policy spaces_insert on public.spaces
  for insert to authenticated with check (created_by = auth.uid());
create policy spaces_update on public.spaces
  for update to authenticated using (public.is_space_owner(id));
create policy spaces_delete on public.spaces
  for delete to authenticated using (public.is_space_owner(id) and not is_personal);

-- Space members.
create policy space_members_select on public.space_members
  for select to authenticated using (public.is_space_member(space_id));
create policy space_members_insert on public.space_members
  for insert to authenticated with check (public.is_space_owner(space_id));
create policy space_members_delete on public.space_members
  for delete to authenticated
  using (user_id = auth.uid() or public.is_space_owner(space_id));

-- Invites: managed by space owners.
create policy space_invites_all on public.space_invites
  for all to authenticated
  using (public.is_space_owner(space_id))
  with check (public.is_space_owner(space_id));

-- Personal horizon data.
create policy life_values_all on public.life_values
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy goals_all on public.goals
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy reviews_all on public.reviews
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy calendar_accounts_all on public.calendar_accounts
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy time_blocks_all on public.time_blocks
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy chat_sessions_all on public.chat_sessions
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy chat_messages_all on public.chat_messages
  for all to authenticated
  using (exists (
    select 1 from public.chat_sessions s
    where s.id = session_id and s.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.chat_sessions s
    where s.id = session_id and s.user_id = auth.uid()
  ));

-- Space-scoped work data.
create policy areas_all on public.areas
  for all to authenticated
  using (public.is_space_member(space_id)) with check (public.is_space_member(space_id));
create policy projects_all on public.projects
  for all to authenticated
  using (public.is_space_member(space_id)) with check (public.is_space_member(space_id));
create policy tasks_all on public.tasks
  for all to authenticated
  using (public.is_space_member(space_id)) with check (public.is_space_member(space_id));
create policy habits_all on public.habits
  for all to authenticated
  using (public.is_space_member(space_id)) with check (public.is_space_member(space_id));
create policy task_comments_select on public.task_comments
  for select to authenticated using (public.is_space_member(space_id));
create policy task_comments_insert on public.task_comments
  for insert to authenticated
  with check (public.is_space_member(space_id) and user_id = auth.uid());
create policy task_comments_delete on public.task_comments
  for delete to authenticated using (user_id = auth.uid());
create policy activity_log_select on public.activity_log
  for select to authenticated using (public.is_space_member(space_id));
create policy activity_log_insert on public.activity_log
  for insert to authenticated
  with check (public.is_space_member(space_id) and user_id = auth.uid());

-- Habit logs: personal, but the habit must be in a visible space.
create policy habit_logs_all on public.habit_logs
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.habits h
      where h.id = habit_id and public.is_space_member(h.space_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Grants (new public entities are not auto-exposed to API roles)
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- Realtime: stream changes for collaborative tables.
alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.projects;
alter publication supabase_realtime add table public.task_comments;
