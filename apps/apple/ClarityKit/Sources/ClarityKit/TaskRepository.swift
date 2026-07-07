import ClarityCore
import Foundation
import Supabase

public struct TaskRepository: Sendable {
    let ctx: RepositoryContext

    public init(_ ctx: RepositoryContext) {
        self.ctx = ctx
    }

    /// Tasks in the space, optionally filtered by status. Sub-tasks are
    /// excluded by default (matching the web views).
    public func tasks(
        statuses: [TaskStatus]? = nil,
        topLevelOnly: Bool = true
    ) async throws -> [TaskItem] {
        var query = ctx.client
            .from("tasks")
            .select()
            .eq("space_id", value: ctx.spaceId.uuidString)
        if let statuses {
            query = query.in("status", values: statuses.map(\.rawValue))
        }
        if topLevelOnly {
            query = query.is("parent_task_id", value: nil)
        }
        return try await query.execute().value
    }

    public func create(_ payload: NewTaskPayload) async throws -> TaskItem {
        try await ctx.client
            .from("tasks")
            .insert(payload)
            .select()
            .single()
            .execute()
            .value
    }

    /// Quick capture: run the text through the natural-language parser and
    /// insert the result.
    public func capture(
        _ text: String,
        projects: [Project] = [],
        now: Date = Date()
    ) async throws -> TaskItem {
        let parsed = parseQuickAdd(text, now: now)
        let payload = NewTaskPayload(
            parsed: parsed, spaceId: ctx.spaceId, createdBy: ctx.userId, projects: projects)
        return try await create(payload)
    }

    public func update(id: UUID, patch: TaskPatch) async throws -> TaskItem {
        try await ctx.client
            .from("tasks")
            .update(patch)
            .eq("id", value: id.uuidString)
            .select()
            .single()
            .execute()
            .value
    }

    public func delete(id: UUID) async throws {
        try await ctx.client
            .from("tasks")
            .delete()
            .eq("id", value: id.uuidString)
            .execute()
    }

    /// Complete (or un-complete) a task. Completing a recurring task spawns
    /// the next occurrence — same logic as the web's useCompleteTask; returns
    /// the spawned task if one was created.
    @discardableResult
    public func complete(
        _ task: TaskItem,
        done: Bool = true,
        now: Date = Date()
    ) async throws -> TaskItem? {
        var patch = TaskPatch()
        patch.status = done ? .done : .next
        if done { patch.completedAt = now } else { patch.clearCompletedAt = true }
        _ = try await ctx.client
            .from("tasks")
            .update(patch)
            .eq("id", value: task.id.uuidString)
            .execute()

        guard done,
            let payload = Self.nextOccurrencePayload(for: task, completedBy: ctx.userId, now: now)
        else { return nil }
        return try await create(payload)
    }

    /// The insert that completing a recurring task produces, or nil when the
    /// task doesn't recur (or is a sub-task). Pure — mirrors useCompleteTask
    /// in apps/web/src/lib/data.ts; keep the two in sync.
    public static func nextOccurrencePayload(
        for task: TaskItem,
        completedBy userId: UUID,
        now: Date = Date()
    ) -> NewTaskPayload? {
        guard let rule = task.recurrenceRule, task.parentTaskId == nil else { return nil }
        let anchor = task.dueAt ?? now
        guard let next = nextOccurrence(rule: rule, anchor: anchor, after: now) else { return nil }
        return NewTaskPayload(
            spaceId: task.spaceId,
            createdBy: userId,
            title: task.title,
            notes: task.notes,
            status: task.status == .inbox ? .inbox : .next,
            projectId: task.projectId,
            assignedTo: task.assignedTo,
            urgency: task.urgency,
            importance: task.importance,
            dueAt: next,
            estimatedMinutes: task.estimatedMinutes,
            energy: task.energy,
            contextTags: task.contextTags,
            recurrenceRule: rule,
            recurrenceParentId: task.recurrenceParentId ?? task.id,
            sortOrder: task.sortOrder
        )
    }
}
