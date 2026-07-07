# Clarity — GTD app

Multi-platform GTD (Getting Things Done) app. Web + Supabase now; SwiftUI
iOS/macOS/watchOS + Siri App Intents planned (see `README.md` roadmap).

## Layout

- `apps/web` — Next.js 16 (App Router, TS, Tailwind v4). Note: middleware is
  `src/proxy.ts` (Next 16 convention), NOT `middleware.ts`.
- `packages/shared` — pure TS domain logic: priority scoring (Eisenhower),
  RRULE-subset recurrence engine, natural-language quick-add parser, DB row
  types. No runtime deps; mirrored in Swift later.
- `supabase` — config + SQL migrations (schema, RLS, triggers).

## Commands

- `npm run dev` — Next dev server (localhost:3000); needs Supabase running
- `npm test` — Vitest unit tests for `packages/shared`
- `npm run db:start` / `db:stop` / `db:reset` — local Supabase (Docker)
- Web env: `apps/web/.env.local` (see `.env.example`); local keys come from
  `npx supabase status`

## Conventions

- All data access goes through RLS-protected Supabase tables; every
  work-item table hangs off a `space_id` (sharing boundary) — policies use
  `is_space_member()` / `is_space_owner()`.
- Client data layer: React Query hooks in `apps/web/src/lib/data.ts`;
  current space comes from `useSpace()` (`lib/space-context.tsx`).
- Weekday numbering everywhere: 0 = Monday … 6 = Sunday (`isoWeekday`).
- Task recurrence: RRULE strings handled by `packages/shared/src/recurrence.ts`
  (FREQ/INTERVAL/BYDAY/BYMONTHDAY subset only); completing a recurring task
  inserts the next occurrence (see `useCompleteTask`).
- New tables in `public` are NOT auto-exposed to API roles — migrations must
  GRANT to `authenticated` and add RLS policies.
