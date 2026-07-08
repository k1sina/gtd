import Foundation

// Row models matching the Supabase schema (snake_case columns).
// Decode with a JSONDecoder using .convertFromSnakeCase, or via the
// supabase-swift client's default decoder configured the same way.

public enum TaskStatus: String, Codable, CaseIterable, Sendable {
    case inbox, next, waiting, scheduled, someday, done, cancelled
}

public enum Energy: String, Codable, CaseIterable, Sendable {
    case low, medium, high
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
    public var energy: Energy?
    public var contextTags: [String]
    public var waitingOn: String?
    public var recurrenceRule: String?
    public var recurrenceParentId: UUID?
    public var sortOrder: Double
    public var completedAt: Date?
    public var createdAt: Date
    public var updatedAt: Date

    public var quadrant: Quadrant {
        ClarityCore.quadrant(urgency: urgency, importance: importance)
    }

    public init(
        id: UUID, spaceId: UUID, projectId: UUID? = nil, parentTaskId: UUID? = nil,
        createdBy: UUID, assignedTo: UUID? = nil, title: String, notes: String? = nil,
        status: TaskStatus = .inbox, urgency: Int = 2, importance: Int = 2,
        dueAt: Date? = nil, deferUntil: Date? = nil, estimatedMinutes: Int? = nil,
        energy: Energy? = nil, contextTags: [String] = [], waitingOn: String? = nil,
        recurrenceRule: String? = nil, recurrenceParentId: UUID? = nil,
        sortOrder: Double = 0, completedAt: Date? = nil,
        createdAt: Date = Date(), updatedAt: Date = Date()
    ) {
        self.id = id
        self.spaceId = spaceId
        self.projectId = projectId
        self.parentTaskId = parentTaskId
        self.createdBy = createdBy
        self.assignedTo = assignedTo
        self.title = title
        self.notes = notes
        self.status = status
        self.urgency = urgency
        self.importance = importance
        self.dueAt = dueAt
        self.deferUntil = deferUntil
        self.estimatedMinutes = estimatedMinutes
        self.energy = energy
        self.contextTags = contextTags
        self.waitingOn = waitingOn
        self.recurrenceRule = recurrenceRule
        self.recurrenceParentId = recurrenceParentId
        self.sortOrder = sortOrder
        self.completedAt = completedAt
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

public enum ProjectStatus: String, Codable, CaseIterable, Sendable {
    case active, someday, completed, archived
    case onHold = "on_hold"

    public var label: String {
        switch self {
        case .active: return "Active"
        case .someday: return "Someday"
        case .onHold: return "On hold"
        case .completed: return "Completed"
        case .archived: return "Archived"
        }
    }
}

public struct Project: Codable, Identifiable, Hashable, Sendable {
    public var id: UUID
    public var spaceId: UUID
    public var areaId: UUID?
    public var goalId: UUID?
    public var name: String
    public var outcome: String?
    public var status: ProjectStatus
    public var sortOrder: Double
    public var reviewedAt: Date?
    public var createdAt: Date
    public var completedAt: Date?

    public init(
        id: UUID, spaceId: UUID, areaId: UUID? = nil, goalId: UUID? = nil,
        name: String, outcome: String? = nil, status: ProjectStatus = .active,
        sortOrder: Double = 0, reviewedAt: Date? = nil,
        createdAt: Date = Date(), completedAt: Date? = nil
    ) {
        self.id = id
        self.spaceId = spaceId
        self.areaId = areaId
        self.goalId = goalId
        self.name = name
        self.outcome = outcome
        self.status = status
        self.sortOrder = sortOrder
        self.reviewedAt = reviewedAt
        self.createdAt = createdAt
        self.completedAt = completedAt
    }
}

public struct Area: Codable, Identifiable, Hashable, Sendable {
    public var id: UUID
    public var spaceId: UUID
    public var name: String
    public var color: String?
    public var sortOrder: Double
    public var createdAt: Date

    public init(
        id: UUID, spaceId: UUID, name: String, color: String? = nil,
        sortOrder: Double = 0, createdAt: Date = Date()
    ) {
        self.id = id
        self.spaceId = spaceId
        self.name = name
        self.color = color
        self.sortOrder = sortOrder
        self.createdAt = createdAt
    }
}

public struct Space: Codable, Identifiable, Hashable, Sendable {
    public var id: UUID
    public var name: String
    public var isPersonal: Bool
    public var createdBy: UUID
    public var createdAt: Date

    public init(id: UUID, name: String, isPersonal: Bool, createdBy: UUID, createdAt: Date = Date()) {
        self.id = id
        self.name = name
        self.isPersonal = isPersonal
        self.createdBy = createdBy
        self.createdAt = createdAt
    }
}

public struct Habit: Codable, Identifiable, Hashable, Sendable {
    public var id: UUID
    public var spaceId: UUID
    public var createdBy: UUID
    public var name: String
    /// 0 = Monday … 6 = Sunday; empty = due every day.
    public var weekdays: [Int]
    public var sortOrder: Double
    public var archivedAt: Date?
    public var createdAt: Date

    public init(
        id: UUID, spaceId: UUID, createdBy: UUID, name: String,
        weekdays: [Int] = [], sortOrder: Double = 0, archivedAt: Date? = nil,
        createdAt: Date = Date()
    ) {
        self.id = id
        self.spaceId = spaceId
        self.createdBy = createdBy
        self.name = name
        self.weekdays = weekdays
        self.sortOrder = sortOrder
        self.archivedAt = archivedAt
        self.createdAt = createdAt
    }

    public func isDue(on date: Date, calendar: Calendar = .current) -> Bool {
        guard !weekdays.isEmpty else { return true }
        let isoWeekday = (calendar.component(.weekday, from: date) + 5) % 7
        return weekdays.contains(isoWeekday)
    }
}

/// `logDate` is a Postgres `date` column ("yyyy-MM-dd"); kept as a string so
/// it round-trips without timezone drift.
public struct HabitLog: Codable, Hashable, Sendable {
    public var habitId: UUID
    public var userId: UUID
    public var logDate: String

    public init(habitId: UUID, userId: UUID, logDate: String) {
        self.habitId = habitId
        self.userId = userId
        self.logDate = logDate
    }
}
