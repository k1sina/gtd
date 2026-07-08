# Clarity Apple apps — testing & usage guide

Step-by-step instructions for building, testing, and using the three native
apps (iPhone, Mac, Apple Watch) and the Siri integration. Everything talks to
the same Supabase backend as the web app, so changes sync across all
platforms within a pull-to-refresh.

---

## 1. Prerequisites

| What | Why |
| --- | --- |
| macOS 14+ with **Xcode 26+** installed and its license accepted (`sudo xcodebuild -license accept`) | Builds all three targets |
| **Homebrew** | Installs XcodeGen |
| A **Clarity account** | The apps only sign in — create the account on the web app first (Sign up on the `/login` page) |
| ~15 GB free disk the first time | Xcode downloads the iOS (~8.5 GB) and watchOS (~4 GB) simulator platforms |

The Supabase URL and anon key are already committed in
[`Configs/Supabase.xcconfig`](Configs/Supabase.xcconfig) (the anon key is
public by design — row-level security authorizes every request), so there is
no environment configuration to do.

Device/OS floors: iOS 17, macOS 14, watchOS 10.

## 2. One-time setup

```sh
brew install xcodegen

cd apps/apple
xcodegen generate          # writes Clarity.xcodeproj (gitignored — always regenerate)

# First time only: install the simulator platforms Xcode needs
xcodebuild -downloadPlatform iOS
xcodebuild -downloadPlatform watchOS
```

Re-run `xcodegen generate` whenever `project.yml` changes or after pulling.
Never edit `Clarity.xcodeproj` by hand — it is generated.

## 3. Run the automated tests

```sh
cd apps/apple
./scripts/test-swift.sh
```

This runs two Swift Testing suites (31 tests):

- **ClarityCore** — priority scoring, the recurrence engine, and the
  quick-add parser. These are line-for-line mirrors of the vitest suites in
  `packages/shared/test`; the expected values must stay identical.
- **ClarityKit** — JSON decode/encode fixtures against real PostgREST row
  shapes, the recurring-completion payload logic, project summaries, and
  habit date keys.

The script works with full Xcode *or* with Command Line Tools alone (it
points the toolchain at the Testing framework the CLT ships).

To additionally type-check every app and watch source file without opening
Xcode:

```sh
swift build --package-path apps/apple/BuildCheck
```

## 4. Build & run

### From the command line

```sh
cd apps/apple

xcodebuild -project Clarity.xcodeproj -scheme Clarity-macOS \
  -destination 'platform=macOS' build

xcodebuild -project Clarity.xcodeproj -scheme Clarity-iOS \
  -destination 'generic/platform=iOS Simulator' build

xcodebuild -project Clarity.xcodeproj -scheme ClarityWatch \
  -destination 'generic/platform=watchOS Simulator' build
```

### From Xcode (recommended for actually using the apps)

1. `open apps/apple/Clarity.xcodeproj`
2. Pick a scheme in the toolbar:
   - **Clarity-macOS** → destination *My Mac* → **⌘R**. The app launches
     directly on your Mac.
   - **Clarity-iOS** → destination *iPhone 17* (or any iPhone simulator) →
     **⌘R**.
   - **ClarityWatch** → destination any Apple Watch simulator → **⌘R**.
3. First run per scheme takes a few minutes (supabase-swift compiles once).

### On real devices

1. In Xcode: project **Clarity** → target → *Signing & Capabilities* → set
   **Team** to your personal team (free Apple ID works). Or set it once for
   all targets in `project.yml` (`settings.base.DEVELOPMENT_TEAM: <team id>`)
   and regenerate.
2. iPhone: plug in (or same Wi-Fi), select it as destination, ⌘R. On the
   phone: Settings → Privacy & Security → **Developer Mode** → on, then
   trust the developer certificate under Settings → General → VPN & Device
   Management.
3. Watch: the watch app is **standalone** — select your watch as the
   destination for the ClarityWatch scheme and run. It installs over Wi-Fi
   (keep the watch on its charger the first time; it's slow).
4. Free-account caveat: apps signed with a free team expire after 7 days —
   just run from Xcode again to refresh.

## 5. Using the iPhone / Mac app

Sign in with your Clarity account (created on the web). The session persists
in the keychain; you won't be asked again.

The iPhone app has five tabs — **Today, Inbox, Next, Browse, Settings** —
where Browse holds everything else (Scheduled, Waiting, Someday, Projects,
Matrix, Habits, Reviews, Goals, Assistant, Search). The Mac app shows all
sections in a grouped sidebar, with the **space switcher** at the top
(switch spaces, create a shared space, or join one from a pasted invite
link; on iPhone the switcher is in each tab's toolbar).

### Today
- **Due & overdue** — everything dated before end of today, ranked by
  priority (importance beats urgency; overdue items get a boost).
- **Top priorities** — the 5 highest-leverage next actions that aren't
  already listed above (deferred tasks are excluded).
- **Habit strip** — today's due habits as tappable chips (with 🔥 streaks).
- **Schedule** — calendar events + focus blocks; **Plan my day** asks the
  server to propose blocks, then Confirm (syncs to Google Calendar when
  connected on the web) or Dismiss.
- **Completed today** — what you already finished; tap the circle to
  un-complete.
- The capture field at the top accepts natural language — see the table
  below.
- Tap the circle to **complete** a task. Completing a repeating task
  automatically schedules its next occurrence — pull to refresh and you'll
  see the new one.

### Inbox
- Raw captures land here. Clarify with swipes:
  - swipe **right** → *Next* (it's actionable)
  - swipe **left** → *Someday* or *Delete*
  - tap → full editor (status, project, priority, dates, recurrence, tags…)
- The **Clarify** toolbar button walks the inbox one item at a time with
  the full GTD decision set: *Did it (2-min rule)*, *Next*, *Schedule*,
  *Waiting for…*, *Someday*, *It's a project* (spawns a project + seed
  task), *Trash* — same flow as the web.

### Next
- Every next action, highest leverage first. The colored dot is the
  Eisenhower quadrant (red = do first, blue = schedule, orange = delegate,
  gray = eliminate). Deferred tasks are dimmed until their defer date.
- Filter chips narrow by `@context` tag and energy level.

### Scheduled / Waiting / Someday (Browse tab on iPhone)
- **Scheduled** groups date-bound + deferred tasks: Overdue, Today, Next
  7 days, Later.
- **Waiting for** lists delegated items (swipe right when they land back on
  your plate).
- **Someday/maybe** parks ideas; swipe right to activate.

### Projects
- Grouped by **area of focus** ("No area" last), with progress bars and an
  orange **stalled** badge when an active project has no next action.
- The **+** button opens the create dialog (name, outcome, area — or create
  a new area inline).
- Project detail: edit name/outcome inline, change status (completing
  stamps the completion date), assign an area, delete (with confirmation),
  and add tasks straight into the project. Subtasks show indented with
  done/total counts.

### Matrix, Habits, Reviews, Goals, Assistant, Search
- **Priority matrix** — the four Eisenhower quadrants. Drag tasks between
  quadrants on Mac/iPad; on iPhone long-press → *Move to…*. Dropping sets
  the quadrant's representative urgency/importance (same values as web).
- **Habits** — current week Mon–Sun grid per habit, streaks, create with
  weekday selection, swipe to archive.
- **Reviews** — weekly (6 guided steps; progress persists mid-review and
  resumes on any platform) and quarterly (score goals 0–10, reflect, seed
  next quarter's goals). The hub shows your weekly streak and history.
- **Goals & values** — life values and quarterly goals with value links,
  statuses, and scores.
- **Assistant** — the same GTD coach as the web `/assistant` page; it can
  read and change your tasks/projects and plan your day. Requires the web
  deployment to have `ANTHROPIC_API_KEY` set.
- **Search** — full-text over titles and notes.

### Settings
- Profile, **sign out**, space switcher + join-a-space.
- In a **shared space**: members with roles, invite by email, copy invite
  links, revoke pending invites. Task editor gains an **assignee** picker
  and a **comments** thread in shared spaces.
- **Calendar & planning** — Google connection status (connect on the web),
  calendar picker, workday hours, block length, max blocks/day.

### Sharing & realtime
- Create a shared space from the space switcher, invite by email, copy the
  link, and accept it on another account via the web `/invite` page or the
  native "Join a space…" sheet.
- Edits made on the web (or by another member) appear on Mac/iPhone within
  a second or two — the apps subscribe to realtime changes for the current
  space.

### Quick-add syntax

Works in every capture field (phone, Mac, watch, Siri). Chips under the
field preview what the parser understood before you commit.

| Type… | Effect |
| --- | --- |
| `tomorrow`, `today`, `tonight`, `friday`, `next monday`, `next week`, `next month`, `in 3 days`, `in 2 weeks` | due date (defaults to 17:00; `tonight` = 20:00) |
| `at 3pm`, `at 15:30`, `9am` | due time (time without a date = the next such time) |
| `@phone @home` | context tags |
| `#Family` | files into the project whose name matches |
| `!urgent` / `!important` | urgency / importance = 4 |
| `!someday` | goes to Someday instead of Inbox |
| `~15m`, `~2h`, `~1h30m` | time estimate |
| `every day`, `every 3 days`, `every monday`, `every weekday`, `every 2 weeks`, `every month` | repeating task (RRULE) |

Example: `Call mom tomorrow at 3pm @phone #Family !urgent ~15m` →
"Call mom", due tomorrow 15:00, tag *phone*, project *Family*, urgency 4,
15-minute estimate.

### Task editor
Tap any task row. You can change status (inbox/next/waiting/scheduled/
someday/done/cancelled), project, urgency/importance steppers (with live
quadrant preview), due & defer dates, repeat rule, estimate, energy, and
tags. *Waiting* status reveals a "waiting on" field.

## 6. Using the Watch app

Three swipeable pages (sign in once; keychain keeps the session):

1. **Today** — due/overdue plus top next actions. Tap a row to complete it
   (recurring tasks reschedule themselves, same as everywhere).
2. **Capture** — tap the text field and dictate (or scribble). The text goes
   through the same quick-add parser: "groceries tomorrow at six pm" works.
3. **Habits** — habits scheduled for today (weekday-aware); tap to log or
   un-log. Create/edit habits themselves on the web app.

The watch talks to Supabase directly over Wi-Fi/LTE — the iPhone doesn't
need to be nearby or even own the app.

## 7. Using Siri

App Shortcuts register automatically on first install — no setup. Give the
system a minute after installing, then:

| Say | What happens |
| --- | --- |
| "**Add a task to Clarity**" / "**Capture in Clarity**" | Siri asks *"What should I capture?"* — answer naturally ("buy milk tomorrow at 9am"); the full quick-add parser runs on it |
| "**Complete *review report* in Clarity**" | Finds the open task by name (asks you to pick if ambiguous), marks it done, and tells you when the next occurrence is if it repeats |
| "**What's due today in Clarity**" / "**Clarity agenda**" | Speaks the count of due/overdue items and the top three |

All three also appear as tiles in the **Shortcuts** app (usable in
automations) and in Spotlight. They run in the background — the app doesn't
open. If you're signed out, Siri answers "Please sign in to Clarity first."

## 8. End-to-end verification checklist

A 10-minute pass that exercises every moving part:

1. `./scripts/test-swift.sh` → 62 tests green (34 ClarityCore +
   28 ClarityKit).
2. Build & run **Clarity-macOS**; sign in.
3. Capture `Water plants every 3 days ~10m @home` → appears in **Inbox**
   with a repeat icon and the parse chips shown beforehand.
4. Swipe/edit it to **Next**, then complete it on the **Today** tab → pull
   to refresh → a new "Water plants" appears, due 3 days out. (This is the
   recurrence engine + completion side effect working end to end.)
5. Open the **web app** → the same tasks are there (same backend, RLS-scoped
   to your account).
6. Run **Clarity-iOS** in a simulator, sign in → same data. Create a project
   `Trip`, then capture `book hotel #Trip friday !important` → lands inside
   *Trip*, due Friday, importance 4.
7. Run **ClarityWatch** in a simulator → Today shows the same list; tap to
   complete something and confirm it disappears from the other platforms
   after a refresh.
8. On a real iPhone: say "Add a task to Clarity", answer with something
   dated; then "What's due today in Clarity" and hear it read back.
9. **Sharing:** create a shared space from the space switcher, invite a
   second account, copy the link, and join from the other account (web
   `/invite` page or the native "Join a space…" sheet). Edit a task from
   the web while the Mac app is open on the same space — it refreshes
   within a couple of seconds (realtime). Assign the task and comment on
   it from both sides.
10. **Reviews:** run the weekly review two steps in, quit the app, reopen —
    it resumes on step 3 (checklist persists per period).
11. **Assistant & planner** (needs `ANTHROPIC_API_KEY` on the web
    deployment): ask "what should I focus on today?" and watch the tool
    captions; on Today press **Plan my day** and confirm a block.

## 9. Troubleshooting

| Symptom | Fix |
| --- | --- |
| `xcodebuild: error: … requires Xcode` or license errors | `sudo xcodebuild -license accept`, and `sudo xcode-select -s /Applications/Xcode.app` |
| "iOS 26.x is not installed" when building | `xcodebuild -downloadPlatform iOS` (same for watchOS) |
| Platform download says **Insufficient space** | Free disk; the iOS image alone needs ~8.5 GB during install |
| Runtimes downloaded but `simctl list runtimes` is empty / simulators "Unavailable" | Stale mountpoints from an interrupted download: `sudo rm -rf /Library/Developer/CoreSimulator/Volumes/*_1` then `killall -9 com.apple.CoreSimulator.CoreSimulatorService` (or reboot) |
| App crashes at launch with *SupabaseURL / SupabaseAnonKey missing* | You built without the generated Info.plist mapping — run `xcodegen generate` and build again; check `Configs/Supabase.xcconfig` exists |
| Sign-in fails with *Invalid login credentials* | Create the account on the web app first; the native apps have no sign-up screen |
| Data loads but is empty | You signed in with a different account than the web; each account only sees its own spaces (RLS) |
| Siri phrases not recognized | Reinstall the app, wait ~1 minute, and check the Shortcuts app lists "Clarity" — if it does, the phrases are registered. On simulators Siri is limited; test intents via the Shortcuts app instead |
| Free-team app stops launching after a week | Provisioning expired — run once more from Xcode |
| Watch install hangs | Keep the watch on its charger and near the phone/Mac; first installs are slow |

## 10. Where things live (for debugging)

- Domain logic (priority/recurrence/parser): `ClarityCore/Sources/ClarityCore/`
- All network/data access: `ClarityKit/Sources/ClarityKit/` (repositories;
  `TaskRepository.complete` is the recurrence side effect)
- iPhone/Mac UI: `Clarity/Views/`, Siri intents: `Clarity/Intents/`
- Watch UI: `ClarityWatch/`
- Target/build definition: `project.yml` (regenerate with `xcodegen generate`)
