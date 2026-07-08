-- Per-user integration settings, editable in the web app's Settings page.
-- Secrets here (Anthropic API key, Google OAuth client) belong to the user
-- who typed them and are guarded by RLS; server routes read them with the
-- user's own client and fall back to server env vars when unset.

create table public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  anthropic_api_key text,
  google_client_id text,
  google_client_secret text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

create policy user_settings_all on public.user_settings
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- New public tables are not auto-exposed to API roles.
grant select, insert, update, delete on public.user_settings to authenticated;

create trigger user_settings_updated_at
  before update on public.user_settings
  for each row execute function public.set_updated_at();
