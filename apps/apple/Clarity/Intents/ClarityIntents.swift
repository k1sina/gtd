import AppIntents
import ClarityCore
import ClarityKit
import Foundation

/// "Add buy milk tomorrow to Clarity" — captures through the same
/// natural-language parser as the in-app quick-add field.
struct AddTaskIntent: AppIntent {
    static let title: LocalizedStringResource = "Add to Clarity Inbox"
    static let description = IntentDescription(
        "Capture a task. Understands dates, times, @tags, #projects, priority, and recurrence — e.g. 'Call mom tomorrow at 3pm @phone !urgent'.")
    static let openAppWhenRun = false

    @Parameter(title: "Task", requestValueDialog: "What should I capture?")
    var text: String

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        let ctx = try await AppSession.shared.readyContext()
        let task = try await TaskRepository(ctx).capture(text)
        var details = ""
        if let due = task.dueAt {
            details = ", due \(due.formatted(date: .abbreviated, time: .shortened))"
        }
        return .result(dialog: "Captured “\(task.title)”\(details).")
    }
}

/// "Complete review report in Clarity" — resolves the task by name.
struct CompleteTaskIntent: AppIntent {
    static let title: LocalizedStringResource = "Complete a Clarity Task"
    static let description = IntentDescription(
        "Mark a task done. Recurring tasks get their next occurrence scheduled.")
    static let openAppWhenRun = false

    @Parameter(title: "Task", requestValueDialog: "Which task did you finish?")
    var task: TaskEntity

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        let ctx = try await AppSession.shared.readyContext()
        let repository = TaskRepository(ctx)
        let full = try await repository.task(id: task.id)
        let spawned = try await repository.complete(full)
        if let next = spawned?.dueAt {
            return .result(
                dialog:
                    "Done: “\(full.title)”. Next one is \(next.formatted(date: .abbreviated, time: .shortened)).")
        }
        return .result(dialog: "Done: “\(full.title)”.")
    }
}

/// "What's due today in Clarity" — a spoken agenda.
struct DueTodayIntent: AppIntent {
    static let title: LocalizedStringResource = "What's Due Today"
    static let description = IntentDescription(
        "Summarizes what's due or overdue today, plus your top next actions.")
    static let openAppWhenRun = false

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog & ReturnsValue<String> {
        let ctx = try await AppSession.shared.readyContext()
        let tasks = try await TaskRepository(ctx)
            .tasks(statuses: [.inbox, .next, .scheduled, .waiting])

        let endOfDay = Calendar.current.startOfDay(for: .now).addingTimeInterval(86_400)
        let due = tasks
            .filter { $0.dueAt.map { $0 < endOfDay } ?? false }
            .sorted { priorityScore($0) > priorityScore($1) }

        let summary: String
        if due.isEmpty {
            let top = tasks
                .filter { $0.status == .next && !isDeferred($0) }
                .sorted { priorityScore($0) > priorityScore($1) }
                .prefix(3)
                .map(\.title)
            summary = top.isEmpty
                ? "Nothing due today, and no next actions lined up."
                : "Nothing due today. Top next actions: \(top.joined(separator: "; "))."
        } else {
            let titles = due.prefix(3).map(\.title).joined(separator: "; ")
            let overdueCount = due.filter { ($0.dueAt ?? .now) < .now }.count
            let overdue = overdueCount > 0 ? " (\(overdueCount) overdue)" : ""
            summary = "\(due.count) due today\(overdue): \(titles)."
        }
        return .result(value: summary, dialog: "\(summary)")
    }
}

struct ClarityShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: AddTaskIntent(),
            phrases: [
                "Add \(\.$text) to \(.applicationName)",
                "Capture \(\.$text) in \(.applicationName)",
                "\(.applicationName) capture",
            ],
            shortTitle: "Capture",
            systemImageName: "plus.circle.fill"
        )
        AppShortcut(
            intent: CompleteTaskIntent(),
            phrases: [
                "Complete \(\.$task) in \(.applicationName)",
                "Mark \(\.$task) done in \(.applicationName)",
            ],
            shortTitle: "Complete",
            systemImageName: "checkmark.circle.fill"
        )
        AppShortcut(
            intent: DueTodayIntent(),
            phrases: [
                "What's due today in \(.applicationName)",
                "\(.applicationName) agenda",
            ],
            shortTitle: "Due today",
            systemImageName: "sun.max.fill"
        )
    }
}
