import AppIntents
import ClarityCore
import ClarityKit
import Foundation

/// A task as Siri/Shortcuts sees it.
struct TaskEntity: AppEntity {
    static let typeDisplayRepresentation = TypeDisplayRepresentation(name: "Task")
    static let defaultQuery = TaskQuery()

    let id: UUID
    let title: String
    let dueAt: Date?

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(
            title: "\(title)",
            subtitle: dueAt.map {
                "\($0.formatted(date: .abbreviated, time: .shortened))"
            }
        )
    }

    init(task: TaskItem) {
        id = task.id
        title = task.title
        dueAt = task.dueAt
    }
}

struct TaskQuery: EntityStringQuery {
    private static let openStatuses: [TaskStatus] = [.inbox, .next, .scheduled, .waiting]

    @MainActor
    private func openTasks() async throws -> [TaskItem] {
        let ctx = try await AppSession.shared.readyContext()
        return try await TaskRepository(ctx).tasks(statuses: Self.openStatuses)
    }

    @MainActor
    func entities(for identifiers: [UUID]) async throws -> [TaskEntity] {
        let ids = Set(identifiers)
        return try await openTasks()
            .filter { ids.contains($0.id) }
            .map(TaskEntity.init)
    }

    @MainActor
    func entities(matching string: String) async throws -> [TaskEntity] {
        let needle = string.lowercased()
        return try await openTasks()
            .filter { $0.title.lowercased().contains(needle) }
            .sorted { priorityScore($0) > priorityScore($1) }
            .prefix(10)
            .map(TaskEntity.init)
    }

    @MainActor
    func suggestedEntities() async throws -> [TaskEntity] {
        try await openTasks()
            .filter { !isDeferred($0) }
            .sorted { priorityScore($0) > priorityScore($1) }
            .prefix(8)
            .map(TaskEntity.init)
    }
}
