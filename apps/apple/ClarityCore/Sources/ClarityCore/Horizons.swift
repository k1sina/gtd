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

// MARK: Lifetime map

/// The scale the lifetime map is drawn against. One row per user;
/// `birthDate` is a Postgres `date` ("yyyy-MM-dd"), kept as a string so it
/// round-trips without timezone drift (same as HabitLog/Review).
public struct LifeHorizon: Codable, Hashable, Sendable {
    public var userId: UUID
    public var birthDate: String?
    /// The horizon the user chooses to plan against, not a prediction.
    public var lifeExpectancy: Int
    public var createdAt: Date
    public var updatedAt: Date

    public init(
        userId: UUID, birthDate: String? = nil, lifeExpectancy: Int = 85,
        createdAt: Date = Date(), updatedAt: Date = Date()
    ) {
        self.userId = userId
        self.birthDate = birthDate
        self.lifeExpectancy = lifeExpectancy
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    /// The input the chapter maths needs, or nil until a birth date is set.
    public var input: LifeHorizonInput? {
        birthDate.map { LifeHorizonInput(birthDate: $0, lifeExpectancy: lifeExpectancy) }
    }
}

public enum ExperienceCategory: String, Codable, CaseIterable, Sendable {
    case travel, adventure, craft, people, create, wellbeing, contribute, other

    public var label: String {
        switch self {
        case .travel: return "Places"
        case .adventure: return "Adventure"
        case .craft: return "Mastery"
        case .people: return "People"
        case .create: return "Create"
        case .wellbeing: return "Body & mind"
        case .contribute: return "Give back"
        case .other: return "Other"
        }
    }

    /// SF Symbol shown on the row and in the picker.
    public var systemImage: String {
        switch self {
        case .travel: return "airplane"
        case .adventure: return "mountain.2"
        case .craft: return "hammer"
        case .people: return "person.2"
        case .create: return "paintpalette"
        case .wellbeing: return "leaf"
        case .contribute: return "hands.sparkles"
        case .other: return "sparkles"
        }
    }
}

/// `dream` — wanted, not yet placed in time. `planned` — given a window.
/// `active` — under way. `lived` — done. `released` — consciously let go,
/// which is the other half of choosing.
public enum ExperienceStatus: String, Codable, CaseIterable, Sendable {
    case dream, planned, active, lived, released

    public var label: String {
        switch self {
        case .dream: return "Dream"
        case .planned: return "Planned"
        case .active: return "In motion"
        case .lived: return "Lived"
        case .released: return "Released"
        }
    }
}

/// An experience the user wants to have, placed into a window of their own
/// life. `targetAgeStart`/`targetAgeEnd` are inclusive ages; both nil means
/// it is still an unplaced dream. `livedOn` is a Postgres `date`.
public struct LifeExperience: Codable, Identifiable, Hashable, Sendable {
    public var id: UUID
    public var userId: UUID
    public var valueId: UUID?
    public var title: String
    public var notes: String?
    public var category: ExperienceCategory
    public var status: ExperienceStatus
    public var targetAgeStart: Int?
    public var targetAgeEnd: Int?
    public var withWhom: String?
    public var livedOn: String?
    public var reflection: String?
    public var sortOrder: Double
    public var createdAt: Date

    public init(
        id: UUID, userId: UUID, valueId: UUID? = nil, title: String,
        notes: String? = nil, category: ExperienceCategory = .other,
        status: ExperienceStatus = .dream, targetAgeStart: Int? = nil,
        targetAgeEnd: Int? = nil, withWhom: String? = nil, livedOn: String? = nil,
        reflection: String? = nil, sortOrder: Double = 0, createdAt: Date = Date()
    ) {
        self.id = id
        self.userId = userId
        self.valueId = valueId
        self.title = title
        self.notes = notes
        self.category = category
        self.status = status
        self.targetAgeStart = targetAgeStart
        self.targetAgeEnd = targetAgeEnd
        self.withWhom = withWhom
        self.livedOn = livedOn
        self.reflection = reflection
        self.sortOrder = sortOrder
        self.createdAt = createdAt
    }
}
