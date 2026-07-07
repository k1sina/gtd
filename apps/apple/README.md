# Clarity — Apple apps (starter)

SwiftUI starter for the iOS/macOS (and later watchOS) apps, talking to the
same Supabase backend as the web app.

> **Status: written, not yet compiled.** This code was authored in a Linux
> environment without a Swift toolchain, so expect to fix small compiler
> errors on first build. The domain logic in `ClarityCore` ships with an
> XCTest suite that mirrors the TypeScript tests in `packages/shared` —
> run it first (`⌘U`) to validate the port.

## Layout

- `ClarityCore/` — Swift package: Eisenhower priority scoring, the
  RRULE-subset recurrence engine, and Codable row models. Mirrors
  `packages/shared`; keep the two in sync when either changes.
- `ClarityApp/` — source files for the app target: Supabase session,
  sign-in, a Today view with quick capture and recurring-task completion,
  and the Siri App Intent (`AddTaskIntent`).

## Assembly (Xcode 16+)

1. **New project** → Multiplatform App → name `Clarity`, interface SwiftUI.
2. **Add the local package**: File → Add Package Dependencies →
   Add Local… → select `apps/apple/ClarityCore`.
3. **Add supabase-swift**: File → Add Package Dependencies →
   `https://github.com/supabase/supabase-swift` (product: `Supabase`).
4. **Replace the generated sources** with the files in `ClarityApp/`
   (delete the template `ContentView.swift` / `ClarityApp.swift`).
5. **Configure Supabase**: set `AppSession.supabaseURL` and
   `supabaseAnonKey` in `ClarityApp.swift` from your project’s
   Settings → API. (Move to an `.xcconfig` before shipping.)
6. **Decoder note**: the models use camelCase properties for snake_case
   columns — configure the Supabase client’s decoder with
   `keyDecodingStrategy = .convertFromSnakeCase` if decoding fails, or add
   `CodingKeys` to the models.
7. **Siri**: no extra capability is needed for App Shortcuts; after the
   first install say “Add *buy milk* to Clarity”. Phrases live in
   `ClarityShortcuts`.

## Roadmap for this target

- Inbox + clarify flow, project list, matrix (reuse `ClarityCore` scoring)
- SwiftData offline cache with background sync
- WidgetKit: today widget + lock-screen quick capture
- watchOS app: voice capture + today checklist + habit ticks
- APNs reminders for reviews and due tasks
