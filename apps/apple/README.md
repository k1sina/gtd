# Clarity — Apple apps

SwiftUI apps for iPhone, Mac, and Apple Watch (plus Siri App Intents),
talking to the same Supabase backend as the web app. The Xcode project is
generated from `project.yml` — never edit `Clarity.xcodeproj` by hand.

## Layout

- `ClarityCore/` — dependency-free Swift package: Eisenhower priority
  scoring, the RRULE-subset recurrence engine, the natural-language
  quick-add parser, and Codable row models. Mirrors `packages/shared`;
  keep the two in sync when either changes (the test suites are ports of
  the vitest suites and must stay identical).
- `ClarityKit/` — the shared data layer (ClarityCore + supabase-swift):
  bundle-driven Supabase config, one JSON strategy for every PostgREST
  round-trip, the `AppSession` (shared with App Intents), and typed
  repositories. `TaskRepository.complete` mirrors the web's
  `useCompleteTask`, including spawning the next recurring occurrence.
- `Clarity/` — iOS + macOS app sources (one source set, two targets):
  Today, Inbox, Next, Projects, task editing, quick-add with live parse
  preview, and the Siri intents (`Clarity/Intents/`).
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

## Roadmap for this target

- Matrix view (reuse ClarityCore scoring) and reviews
- SwiftData offline cache with background sync
- WidgetKit: today widget + lock-screen quick capture
- APNs reminders for reviews and due tasks
