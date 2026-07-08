import Foundation

// Horizons-of-focus rows: life values -> quarterly goals -> reviews.
// Mirrors packages/shared/src/types.ts.

public struct LifeValue: Codable, Identifiable, Hashable, Sendable {
    public var id: UUID
    public var userId: UUID
    public var name: String
    public var description: String?
    public var sortOrder: Double
    public var createdAt: Date

    public init(
        id: UUID, userId: UUID, name: String, description: String? = nil,
        sortOrder: Double = 0, createdAt: Date = Date()
    ) {
        self.id = id
        self.userId = userId
        self.name = name
        self.description = description
        self.sortOrder = sortOrder
        self.createdAt = createdAt
    }
}

public enum GoalStatus: String, Codable, CaseIterable, Sendable {
    case active, achieved, partial, dropped

    public var label: String {
        switch self {
        case .active: return "Active"
        case .achieved: return "Achieved"
        case .partial: return "Partial"
        case .dropped: return "Dropped"
        }
    }
}

public struct Goal: Codable, Identifiable, Hashable, Sendable {
    public var id: UUID
    public var userId: UUID
    public var valueId: UUID?
    public var title: String
    public var description: String?
    public var year: Int
    public var quarter: Int
    public var status: GoalStatus
    public var score: Int?
    public var reflection: String?
    public var sortOrder: Double
    public var createdAt: Date

    public init(
        id: UUID, userId: UUID, valueId: UUID? = nil, title: String,
        description: String? = nil, year: Int, quarter: Int,
        status: GoalStatus = .active, score: Int? = nil, reflection: String? = nil,
        sortOrder: Double = 0, createdAt: Date = Date()
    ) {
        self.id = id
        self.userId = userId
        self.valueId = valueId
        self.title = title
        self.description = description
        self.year = year
        self.quarter = quarter
        self.status = status
        self.score = score
        self.reflection = reflection
        self.sortOrder = sortOrder
        self.createdAt = createdAt
    }
}

public enum ReviewType: String, Codable, CaseIterable, Sendable {
    case weekly, quarterly
}

/// `periodStart`/`periodEnd` are Postgres `date` columns ("yyyy-MM-dd"); kept
/// as strings so they round-trip without timezone drift (same as HabitLog).
public struct Review: Codable, Identifiable, Hashable, Sendable {
    public var id: UUID
    public var userId: UUID
    public var type: ReviewType
    public var periodStart: String
    public var periodEnd: String
    public var checklist: [String: Bool]
    public var notes: String?
    public var startedAt: Date
    public var completedAt: Date?

    public init(
        id: UUID, userId: UUID, type: ReviewType, periodStart: String,
        periodEnd: String, checklist: [String: Bool] = [:], notes: String? = nil,
        startedAt: Date = Date(), completedAt: Date? = nil
    ) {
        self.id = id
        self.userId = userId
        self.type = type
        self.periodStart = periodStart
        self.periodEnd = periodEnd
        self.checklist = checklist
        self.notes = notes
        self.startedAt = startedAt
        self.completedAt = completedAt
    }
}
