import Foundation

// Day-planner rows and preferences. Planning itself happens on the server
// (packages/shared/src/timeblock.ts via /api/plan); the apps only render
// time blocks and edit preferences.

public enum TimeBlockStatus: String, Codable, CaseIterable, Sendable {
    case suggested, confirmed, synced, cancelled
}

public struct TimeBlock: Codable, Identifiable, Hashable, Sendable {
    public var id: UUID
    public var userId: UUID
    public var taskId: UUID?
    public var calendarEventId: String?
    public var startsAt: Date
    public var endsAt: Date
    public var status: TimeBlockStatus
    public var createdAt: Date

    public init(
        id: UUID, userId: UUID, taskId: UUID? = nil, calendarEventId: String? = nil,
        startsAt: Date, endsAt: Date, status: TimeBlockStatus = .suggested,
        createdAt: Date = Date()
    ) {
        self.id = id
        self.userId = userId
        self.taskId = taskId
        self.calendarEventId = calendarEventId
        self.startsAt = startsAt
        self.endsAt = endsAt
        self.status = status
        self.createdAt = createdAt
    }
}

/// Daily-planning preferences stored in `calendar_accounts.settings` (jsonb).
/// IMPORTANT: the web app reads/writes these keys in camelCase — encode this
/// struct with a plain JSONEncoder, never the snake_case Postgrest encoder.
public struct PlannerConfig: Codable, Hashable, Sendable {
    public var workStart: String
    public var workEnd: String
    public var defaultBlockMinutes: Int
    public var bufferMinutes: Int
    public var maxBlockMinutes: Int
    public var maxBlocks: Int

    public init(
        workStart: String, workEnd: String, defaultBlockMinutes: Int,
        bufferMinutes: Int, maxBlockMinutes: Int, maxBlocks: Int
    ) {
        self.workStart = workStart
        self.workEnd = workEnd
        self.defaultBlockMinutes = defaultBlockMinutes
        self.bufferMinutes = bufferMinutes
        self.maxBlockMinutes = maxBlockMinutes
        self.maxBlocks = maxBlocks
    }

    /// Mirrors DEFAULT_PLANNER_CONFIG in packages/shared/src/timeblock.ts.
    public static let `default` = PlannerConfig(
        workStart: "09:00", workEnd: "17:00", defaultBlockMinutes: 45,
        bufferMinutes: 10, maxBlockMinutes: 120, maxBlocks: 6
    )

    /// The settings column may hold any subset of keys; missing ones fall
    /// back to the defaults (mirrors web `plannerConfig(account)` merge).
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let d = PlannerConfig.default
        workStart = try c.decodeIfPresent(String.self, forKey: .workStart) ?? d.workStart
        workEnd = try c.decodeIfPresent(String.self, forKey: .workEnd) ?? d.workEnd
        defaultBlockMinutes = try c.decodeIfPresent(Int.self, forKey: .defaultBlockMinutes) ?? d.defaultBlockMinutes
        bufferMinutes = try c.decodeIfPresent(Int.self, forKey: .bufferMinutes) ?? d.bufferMinutes
        maxBlockMinutes = try c.decodeIfPresent(Int.self, forKey: .maxBlockMinutes) ?? d.maxBlockMinutes
        maxBlocks = try c.decodeIfPresent(Int.self, forKey: .maxBlocks) ?? d.maxBlocks
    }
}
