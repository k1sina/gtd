import ClarityCore
import Foundation

/// Insert payload for a task row. Optionals are omitted when nil (synthesized
/// Codable uses encodeIfPresent), so database defaults stay in charge.
public struct NewTaskPayload: Encodable, Sendable {
    public var spaceId: UUID
    public var createdBy: UUID
    public var title: String
    public var notes: String?
    public var outcome: String?
    public var status: TaskStatus
    public var parentTaskId: UUID?
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
    public var completedAt: Date?
    public var externalRef: String?

    public init(
        spaceId: UUID,
        createdBy: UUID,
        title: String,
        notes: String? = nil,
        outcome: String? = nil,
        status: TaskStatus = .inbox,
        parentTaskId: UUID? = nil,
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
        sortOrder: Double? = nil,
        completedAt: Date? = nil,
        externalRef: String? = nil
    ) {
        self.spaceId = spaceId
        self.createdBy = createdBy
        self.title = title
        self.notes = notes
        self.outcome = outcome
        self.status = status
        self.parentTaskId = parentTaskId
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
        self.completedAt = completedAt
        self.externalRef = externalRef
    }

    enum CodingKeys: String, CodingKey {
        case spaceId, createdBy, title, notes, outcome, status, parentTaskId
        case assignedTo, urgency, importance, dueAt, deferUntil, estimatedMinutes
        case energy, contextTags, waitingOn, recurrenceRule, recurrenceParentId
        case sortOrder, completedAt, externalRef
    }

    /// Explicit encoding so every row carries the same keys — PostgREST
    /// rejects bulk inserts whose rows have differing columns. Nil optionals
    /// become SQL nulls; `sort_order` is NOT NULL in the schema, so nil falls
    /// back to the column default of 0 instead.
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(spaceId, forKey: .spaceId)
        try c.encode(createdBy, forKey: .createdBy)
        try c.encode(title, forKey: .title)
        try c.encode(notes, forKey: .notes)
        try c.encode(outcome, forKey: .outcome)
        try c.encode(status, forKey: .status)
        try c.encode(parentTaskId, forKey: .parentTaskId)
        try c.encode(assignedTo, forKey: .assignedTo)
        try c.encode(urgency, forKey: .urgency)
        try c.encode(importance, forKey: .importance)
        try c.encode(dueAt, forKey: .dueAt)
        try c.encode(deferUntil, forKey: .deferUntil)
        try c.encode(estimatedMinutes, forKey: .estimatedMinutes)
        try c.encode(energy, forKey: .energy)
        try c.encode(contextTags, forKey: .contextTags)
        try c.encode(waitingOn, forKey: .waitingOn)
        try c.encode(recurrenceRule, forKey: .recurrenceRule)
        try c.encode(recurrenceParentId, forKey: .recurrenceParentId)
        try c.encode(sortOrder ?? 0, forKey: .sortOrder)
        try c.encode(completedAt, forKey: .completedAt)
        try c.encode(externalRef, forKey: .externalRef)
    }

    /// Map a quick-add parse onto an insert payload, resolving the `#Parent`
    /// hint against the given candidate tasks — open, top-level titles (exact
    /// match first, then prefix). A hit files the new task as a subtask.
    public init(
        parsed: ParsedQuickAdd,
        spaceId: UUID,
        createdBy: UUID,
        parentCandidates: [TaskItem] = []
    ) {
        var parentTaskId: UUID?
        if let hint = parsed.parentHint?.lowercased() {
            let candidates = parentCandidates.filter {
                $0.parentTaskId == nil && $0.status != .done && $0.status != .cancelled
            }
            parentTaskId = (candidates.first { $0.title.lowercased() == hint }
                ?? candidates.first { $0.title.lowercased().hasPrefix(hint) })?.id
        }
        self.init(
            spaceId: spaceId,
            createdBy: createdBy,
            title: parsed.title.isEmpty ? "Untitled" : parsed.title,
            status: parsed.someday ? .someday : .inbox,
            parentTaskId: parentTaskId,
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
    public var outcome: String?
    public var status: TaskStatus?
    public var parentTaskId: UUID?
    public var assignedTo: UUID?
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
    public var clearParentTaskId = false
    public var clearOutcome = false
    public var clearEstimatedMinutes = false
    public var clearEnergy = false
    public var clearWaitingOn = false
    public var clearAssignedTo = false

    public init() {}

    private enum CodingKeys: String, CodingKey {
        case title, notes, outcome, status, parentTaskId, assignedTo, urgency,
            importance, dueAt, deferUntil, estimatedMinutes, energy, contextTags,
            waitingOn, recurrenceRule, sortOrder, completedAt
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

        if clearOutcome { try c.encodeNil(forKey: .outcome) }
        else { try c.encodeIfPresent(outcome, forKey: .outcome) }
        if clearParentTaskId { try c.encodeNil(forKey: .parentTaskId) }
        else { try c.encodeIfPresent(parentTaskId, forKey: .parentTaskId) }
        if clearAssignedTo { try c.encodeNil(forKey: .assignedTo) }
        else { try c.encodeIfPresent(assignedTo, forKey: .assignedTo) }
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
