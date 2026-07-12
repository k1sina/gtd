# Clarity — GTD app

Multi-platform GTD (Getting Things Done) app: web (Next.js + Supabase),
SwiftUI apps for iPhone/Mac/Watch with Siri App Intents, and an MCP server.

## Layout

- `apps/web` — Next.js 16 (App Router, TS, Tailwind v4). Note: middleware is
  `src/proxy.ts` (Next 16 convention), NOT `middleware.ts`.
- `apps/apple` — Swift. `ClarityCore` (SPM: domain logic mirroring
  `packages/shared` — keep the two and their test suites in sync),
  `ClarityKit` (SPM: Supabase data layer shared by all targets),
  `Clarity/` (iOS+macOS app sources + App Intents), `ClarityWatch/`
  (standalone watch app). Xcode project is GENERATED: edit `project.yml`,
  run `xcodegen generate` — never edit `Clarity.xcodeproj`.
- `apps/mcp` — MCP stdio server mirroring the web assistant's 4 tools
  (`apps/web/src/lib/assistant-tools.ts`); keep the two in sync. Config via
  `apps/mcp/.env` (gitignored), registered in root `.mcp.json`. A remote MCP
  endpoint (`apps/web/src/app/api/mcp/route.ts`, Streamable HTTP, Basic auth
  = Supabase email/password) reuses `assistant-tools.ts` directly.
- `packages/shared` — pure TS domain logic: priority scoring (Eisenhower),
  RRULE-subset recurrence engine, natural-language quick-add parser, DB row
  types. No runtime deps.
- `supabase` — config + SQL migrations (schema, RLS, triggers).

## Commands

- `npm run dev` — Next dev server (localhost:3000); needs Supabase running
- `npm test` — Vitest unit tests for `packages/shared`
- `npm run db:start` / `db:stop` / `db:reset` — local Supabase (Docker)
- Web env: `apps/web/.env.local` (see `.env.example`); local keys come from
  `npx supabase status`
- `apps/apple/scripts/test-swift.sh` — Swift test suites (works without Xcode)
- `swift build --package-path apps/apple/BuildCheck` — type-check all app
  and watch sources without Xcode
- `npm run smoke -w @gtd/mcp` — MCP end-to-end smoke test (tier 2 needs
  credentials in `apps/mcp/.env`)

## Conventions

- All data access goes through RLS-protected Supabase tables; every
  work-item table hangs off a `space_id` (sharing boundary) — policies use
  `is_space_member()` / `is_space_owner()`.
- Client data layer: React Query hooks in `apps/web/src/lib/data.ts`;
  current space comes from `useSpace()` (`lib/space-context.tsx`). Swift
  equivalent: `ClarityKit` repositories.
- Weekday numbering everywhere: 0 = Monday … 6 = Sunday (`isoWeekday`).
- Task recurrence: RRULE strings handled by `packages/shared/src/recurrence.ts`
  (FREQ/INTERVAL/BYDAY/BYMONTHDAY subset only); completing a recurring task
  inserts the next occurrence CLIENT-side — the insert payload comes from
  `nextOccurrenceInsert` (`packages/shared/src/completion.ts`) for all TS
  clients (web UI, web assistant, MCP) and from Swift
  `TaskRepository.nextOccurrencePayload`; keep those two in sync.
- Manual list order: `tasks.sort_order` (double, default 0) sorts ascending
  BEFORE priority in Next/Someday/subtask lists; drag-and-drop persists it
  via the `reorder_tasks` RPC (midpoint write, renumber fallback). Helpers in
  `packages/shared/src/ordering.ts` ↔ `ClarityCore/Ordering.swift` — keep in
  sync.
- New tables in `public` are NOT auto-exposed to API roles — migrations must
  GRANT to `authenticated` and add RLS policies.
