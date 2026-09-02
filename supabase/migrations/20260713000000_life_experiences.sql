-- Lifetime map: the experiences a person wants to have, placed into windows
-- of their own life (age ranges) rather than onto calendar dates.
--
-- Two tables:
--   life_horizon      one row per user — birth date + assumed life expectancy.
--                     Without it the map has no scale, so the UI asks for it
--                     before showing anything.
--   life_experiences  the experiences themselves. `target_age_start/end` is
--                     the window ("in my 40s", "before 50"); both null means
--                     the experience is still an unplaced dream.
--
-- Both are personal horizon data (like life_values / goals): user-scoped, not
-- space-scoped, so they never leak into a shared space.

create table public.life_horizon (
  user_id uuid primary key references auth.users (id) on delete cascade,
  birth_date date,
  -- Not a prediction — the horizon the user chooses to plan against.
  life_expectancy int not null default 85 check (life_expectancy between 40 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.life_experiences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  value_id uuid references public.life_values (id) on delete set null,
  title text not null,
  notes text,
  category text not null default 'other'
    check (category in (
      'travel', 'adventure', 'craft', 'people',
      'create', 'wellbeing', 'contribute', 'other'
    )),
  status text not null default 'dream'
    check (status in ('dream', 'planned', 'active', 'lived', 'released')),
  -- Inclusive age window. Both null = not placed in life yet.
  target_age_start int check (target_age_start between 0 and 120),
  target_age_end int check (target_age_end between 0 and 120),
  constraint life_experiences_age_window check (
    target_age_start is null
    or target_age_end is null
    or target_age_end >= target_age_start
  ),
  with_whom text,
  lived_on date,
  reflection text,
  sort_order double precision not null default 0,
  created_at timestamptz not null default now()
);

create index life_experiences_user_window_idx
  on public.life_experiences (user_id, target_age_start);

alter table public.life_horizon enable row level security;
alter table public.life_experiences enable row level security;

create policy life_horizon_all on public.life_horizon
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy life_experiences_all on public.life_experiences
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- New public tables are not auto-exposed to API roles.
grant select, insert, update, delete on public.life_horizon to authenticated;
grant select, insert, update, delete on public.life_experiences to authenticated;

create trigger life_horizon_updated_at
  before update on public.life_horizon
  for each row execute function public.set_updated_at();
