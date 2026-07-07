import ClarityCore
import Foundation

/// Insert payload for a task row. Optionals are omitted when nil (synthesized
/// Codable uses encodeIfPresent), so database defaults stay in charge.
public struct NewTaskPayload: Encodable, Sendable {
    public var spaceId: UUID
    public var createdBy: UUID
    public var title: String
    public var notes: String?
    public var status: TaskStatus
    public var projectId: UUID?
    public var assignedTo: UUID?
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
    public var sortOrder: Double?

    public init(
        spaceId: UUID,
        createdBy: UUID,
        title: String,
        notes: String? = nil,
        status: TaskStatus = .inbox,
        projectId: UUID? = nil,
        assignedTo: UUID? = nil,
        urgency: Int = 2,
        importance: Int = 2,
        dueAt: Date? = nil,
        deferUntil: Date? = nil,
        estimatedMinutes: Int? = nil,
        energy: Energy? = nil,
        contextTags: [String] = [],
        waitingOn: String? = nil,
        recurrenceRule: String? = nil,
        recurrenceParentId: UUID? = nil,
        sortOrder: Double? = nil
    ) {
        self.spaceId = spaceId
        self.createdBy = createdBy
        self.title = title
        self.notes = notes
        self.status = status
        self.projectId = projectId
        self.assignedTo = assignedTo
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
    }

    /// Map a quick-add parse onto an insert payload, resolving the `#Project`
    /// hint against the given project list (exact match first, then prefix).
    public init(
        parsed: ParsedQuickAdd,
        spaceId: UUID,
        createdBy: UUID,
        projects: [Project] = []
    ) {
        var projectId: UUID?
        if let hint = parsed.projectHint?.lowercased() {
            projectId = (projects.first { $0.name.lowercased() == hint }
                ?? projects.first { $0.name.lowercased().hasPrefix(hint) })?.id
        }
        self.init(
            spaceId: spaceId,
            createdBy: createdBy,
            title: parsed.title.isEmpty ? "Untitled" : parsed.title,
            status: parsed.someday ? .someday : .inbox,
            projectId: projectId,
            urgency: parsed.urgency ?? 2,
            importance: parsed.importance ?? 2,
            dueAt: parsed.dueAt,
            estimatedMinutes: parsed.estimatedMinutes,
            contextTags: parsed.tags,
            recurrenceRule: parsed.recurrenceRule
        )
    }
}

/// Update payload for a task row. nil = leave the column alone; the `clear*`
/// flags write explicit SQL nulls.
public struct TaskPatch: Encodable, Sendable {
    public var title: String?
    public var notes: String?
    public var status: TaskStatus?
    public var projectId: UUID?
    public var urgency: Int?
    public var importance: Int?
    public var dueAt: Date?
    public var deferUntil: Date?
    public var estimatedMinutes: Int?
    public var energy: Energy?
    public var contextTags: [String]?
    public var waitingOn: String?
    public var recurrenceRule: String?
    public var sortOrder: Double?
    public var completedAt: Date?

    public var clearDueAt = false
    public var clearDeferUntil = false
    public var clearRecurrenceRule = false
    public var clearCompletedAt = false
    public var clearProjectId = false
    public var clearEstimatedMinutes = false
    public var clearEnergy = false
    public var clearWaitingOn = false

    public init() {}

    private enum CodingKeys: String, CodingKey {
        case title, notes, status, projectId, urgency, importance, dueAt,
            deferUntil, estimatedMinutes, energy, contextTags, waitingOn,
            recurrenceRule, sortOrder, completedAt
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(title, forKey: .title)
        try c.encodeIfPresent(notes, forKey: .notes)
        try c.encodeIfPresent(status, forKey: .status)
        try c.encodeIfPresent(urgency, forKey: .urgency)
        try c.encodeIfPresent(importance, forKey: .importance)
        try c.encodeIfPresent(contextTags, forKey: .contextTags)
        try c.encodeIfPresent(sortOrder, forKey: .sortOrder)

        if clearProjectId { try c.encodeNil(forKey: .projectId) }
        else { try c.encodeIfPresent(projectId, forKey: .projectId) }
        if clearDueAt { try c.encodeNil(forKey: .dueAt) }
        else { try c.encodeIfPresent(dueAt, forKey: .dueAt) }
        if clearDeferUntil { try c.encodeNil(forKey: .deferUntil) }
        else { try c.encodeIfPresent(deferUntil, forKey: .deferUntil) }
        if clearEstimatedMinutes { try c.encodeNil(forKey: .estimatedMinutes) }
        else { try c.encodeIfPresent(estimatedMinutes, forKey: .estimatedMinutes) }
        if clearEnergy { try c.encodeNil(forKey: .energy) }
        else { try c.encodeIfPresent(energy, forKey: .energy) }
        if clearWaitingOn { try c.encodeNil(forKey: .waitingOn) }
        else { try c.encodeIfPresent(waitingOn, forKey: .waitingOn) }
        if clearRecurrenceRule { try c.encodeNil(forKey: .recurrenceRule) }
        else { try c.encodeIfPresent(recurrenceRule, forKey: .recurrenceRule) }
        if clearCompletedAt { try c.encodeNil(forKey: .completedAt) }
        else { try c.encodeIfPresent(completedAt, forKey: .completedAt) }
    }
}
