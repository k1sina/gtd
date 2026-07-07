import Foundation

// Row models matching the Supabase schema (snake_case columns).
// Decode with a JSONDecoder using .convertFromSnakeCase, or via the
// supabase-swift client's default decoder configured the same way.

public enum TaskStatus: String, Codable, CaseIterable, Sendable {
    case inbox, next, waiting, scheduled, someday, done, cancelled
}

public struct TaskItem: Codable, Identifiable, Hashable, Sendable, Prioritizable {
    public var id: UUID
    public var spaceId: UUID
    public var projectId: UUID?
    public var parentTaskId: UUID?
    public var createdBy: UUID
    public var assignedTo: UUID?
    public var title: String
    public var notes: String?
    public var status: TaskStatus
    public var urgency: Int
    public var importance: Int
    public var dueAt: Date?
    public var deferUntil: Date?
    public var estimatedMinutes: Int?
    public var contextTags: [String]
    public var waitingOn: String?
    public var recurrenceRule: String?
    public var recurrenceParentId: UUID?
    public var sortOrder: Double
    public var completedAt: Date?
    public var createdAt: Date

    public var quadrant: Quadrant {
        ClarityCore.quadrant(urgency: urgency, importance: importance)
    }
}

public struct Project: Codable, Identifiable, Hashable, Sendable {
    public var id: UUID
    public var spaceId: UUID
    public var name: String
    public var outcome: String?
    public var status: String
    public var sortOrder: Double
}

public struct Space: Codable, Identifiable, Hashable, Sendable {
    public var id: UUID
    public var name: String
    public var isPersonal: Bool
}
