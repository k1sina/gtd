-- External reference for rows imported from (or later synced with) outside
-- systems, e.g. Apple Reminders ("apple-reminders:<calendarItemExternalIdentifier>").
-- The unique index makes imports idempotent per space: importers upsert with
-- ON CONFLICT (space_id, external_ref) DO NOTHING. It is deliberately not a
-- partial index — PostgREST cannot infer partial indexes for ON CONFLICT —
-- and NULLs are distinct, so ordinary tasks (external_ref IS NULL) never
-- collide.

alter table public.tasks add column external_ref text;

create unique index tasks_external_ref_key
  on public.tasks (space_id, external_ref);
