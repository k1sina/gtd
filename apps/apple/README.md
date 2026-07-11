# Clarity — Apple apps

SwiftUI apps for iPhone, Mac, and Apple Watch (plus Siri App Intents),
talking to the same Supabase backend as the web app. The Xcode project is
generated from `project.yml` — never edit `Clarity.xcodeproj` by hand.

> **New here? [TESTING.md](TESTING.md)** is the complete step-by-step guide:
> setup, building, running on simulators and real devices, using every
> screen, quick-add syntax, Siri phrases, an end-to-end verification
> checklist, and troubleshooting.

## Layout

- `ClarityCore/` — dependency-free Swift package: Eisenhower priority
  scoring, the RRULE-subset recurrence engine, the natural-language
  quick-add parser, and Codable row models. Mirrors `packages/shared`;
  keep the two in sync when either changes (the test suites are ports of
  the vitest suites and must stay identical).
- `ClarityKit/` — the shared data layer (ClarityCore + supabase-swift):
  bundle-driven Supabase config, one JSON strategy for every PostgREST
  round-trip, the multi-space `AppSession` (shared with App Intents,
  includes realtime change subscriptions), typed repositories, and
  `ClarityAPI` — the client for the deployed web app's API routes
  (assistant chat, day planner, calendar), authenticated with the Supabase
  access token as a Bearer header. `TaskRepository.complete` mirrors the
  web's `useCompleteTask`, including spawning the next recurring occurrence.
- `Clarity/` — iOS + macOS app sources (one source set, two targets), at
  feature parity with the web app: Today (habit strip, day planner,
  completed today), Inbox + guided clarify flow, Next (context/energy
  filters), Scheduled, Waiting-for, Someday, nested subtasks (a task with
  subtasks is a project — outcome line, stalled detection, surfaced next
  action), per-task Eisenhower matrix in the edit sheet,
  Habits, weekly/quarterly Reviews, Goals & values, AI Assistant, full-text
  Search, Settings (sharing, invites, calendar & planning preferences),
  spaces (create/join/switch), sign-up, and the Siri intents
  (`Clarity/Intents/`).
- `ClarityWatch/` — standalone watch app: capture (dictation), today
  checklist, habit ticks. Signs in once; the session persists in the
  keychain.
- `BuildCheck/` — dev-only package that compiles `Clarity/` and
  `ClarityWatch/` as macOS libraries so app code stays type-checkable on
  machines without Xcode.
- `Configs/Supabase.xcconfig` — Supabase URL + anon key (public by
  design; RLS enforces authorization), mapped into each target's
  Info.plist by `project.yml`.

## Build & run

```sh
brew install xcodegen            # once
cd apps/apple
xcodegen generate                # writes Clarity.xcodeproj (gitignored)

xcodebuild -project Clarity.xcodeproj -scheme Clarity-macOS -destination 'platform=macOS' build
xcodebuild -project Clarity.xcodeproj -scheme Clarity-iOS   -destination 'platform=iOS Simulator,name=iPhone 17' build
xcodebuild -project Clarity.xcodeproj -scheme ClarityWatch  -destination 'generic/platform=watchOS Simulator' build
```

or open `Clarity.xcodeproj` in Xcode and hit Run. For a real device, set
your team once: Signing & Capabilities → Team (or add
`DEVELOPMENT_TEAM: <id>` under `settings.base` in `project.yml`).

## Tests

```sh
./scripts/test-swift.sh
```

Runs the ClarityCore + ClarityKit Swift Testing suites. Works with full
Xcode or with Command Line Tools alone (where XCTest is missing — the
script points the toolchain at the Testing framework the CLT ships).

## Siri

No extra capability needed — App Shortcuts register on first install:

- “Add *buy milk tomorrow at 9am* to Clarity” (full quick-add parsing)
- “Complete *review report* in Clarity” (resolves the task by name)
- “What's due today in Clarity” / “Clarity agenda”

Phrases live in `Clarity/Intents/ClarityIntents.swift`.

## Web API features (assistant, planner, calendar)

The assistant chat, "Plan my day", and calendar views call the deployed
web app's API routes (the Anthropic key and Google tokens live server-side).
`WEB_APP_BASE_URL` in `Configs/Supabase.xcconfig` points at the deployment;
the routes accept the Supabase access token as `Authorization: Bearer …`.
Google Calendar *connect* stays on the web (`/settings`); once connected,
the native apps read events and edit planning preferences.

## Roadmap for this target

- SwiftData offline cache with background sync
- WidgetKit: today widget + lock-screen quick capture
- APNs reminders for reviews and due tasks
- Universal links for invite acceptance (currently: paste the invite link
  into "Join a space…")
