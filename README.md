# Clarity — a GTD app for the whole of life

A Getting-Things-Done app built around the full GTD loop — **capture,
clarify, organize, engage, review** — plus the horizons above it: life
values, quarterly goals, and quarterly reviews. Built to eventually span
web, macOS, iOS, watchOS, and Siri, with shared spaces for collaborating
with a partner.

## What works today (web)

- **Capture** — global quick-add (press `N` or `⌘K`) with natural-language
  parsing: `Call mom tomorrow 3pm @phone #Family !urgent ~15m every week`
- **Clarify** — guided inbox triage: 2-minute rule, next action, waiting-for,
  someday, convert to project, trash
- **Organize** — projects with subtasks and desired outcomes, areas of focus,
  context tags, energy levels, defer dates
- **Engage** — Today view, Next Actions (filter by context/energy),
  Eisenhower priority matrix (urgency × importance) with drag-and-drop
- **Recurrence & habits** — repeating tasks (RRULE subset) that respawn on
  completion; habit tracker with weekly grid and streaks
- **Review** — guided weekly review wizard (inbox zero → calendar → stalled
  projects → waiting-for → someday → weekly priorities) with streaks;
  quarterly review that scores goals and seeds the next quarter
- **Horizons** — life values and quarterly goals, linked to projects
- **Search** — Postgres full-text search across tasks and notes

## Stack

- `apps/web` — Next.js 16 + TypeScript + Tailwind v4 + React Query
- `packages/shared` — dependency-free domain logic (priority scoring,
  recurrence engine, NL parser) with Vitest tests; designed to be mirrored
  in Swift for the Apple apps
- `supabase` — Postgres schema, row-level security (space-based sharing),
  auth, realtime

## Running locally

Prereqs: Node 22+, Docker (for local Supabase).

```bash
npm install
npm run db:start          # local Supabase (applies migrations)
# copy the printed API URL + anon key into apps/web/.env.local
#   (template: apps/web/.env.example)
npm run dev               # http://localhost:3000
npm test                  # unit tests for packages/shared
```

## Roadmap

| Phase | Scope | Status |
| --- | --- | --- |
| 0–1 | Monorepo, schema/RLS, auth, core GTD (capture → engage) | ✅ done |
| 2 | Weekly/quarterly reviews, values & goals | ✅ done |
| 3 | Google Calendar integration + automated time-blocking | ✅ done |
| 4 | AI assistant (Claude tool-use: command the app, plan my week, review copilot) | ✅ done |
| 5 | Collaboration: shared spaces, invites, assignments, comments, realtime | ✅ done |
| 6 | Apple platforms: SwiftUI multiplatform app, Siri App Intents, widgets, watchOS | planned |

The database schema for phases 3–5 (calendar accounts, time blocks, chat
sessions, space invites, comments, activity log) already ships in the
initial migration, so later phases are additive.
