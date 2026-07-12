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
        topLevelOnly: Bool = true,
        completedAfter: Date? = nil
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
        if let completedAfter {
            query = query.gte(
                "completed_at",
                value: ISO8601DateFormatter().string(from: completedAfter))
        }
        return try await query.execute().value
    }

    /// Every context tag used in the space (distinct, sorted) — for tag
    /// suggestions in the editor.
    public func contextTags() async throws -> [String] {
        struct Row: Decodable {
            let contextTags: [String]
        }
        let rows: [Row] = try await ctx.client
            .from("tasks")
            .select("context_tags")
            .eq("space_id", value: ctx.spaceId.uuidString)
            .execute()
            .value
        return Array(Set(rows.flatMap(\.contextTags))).sorted()
    }

    /// Number of unclarified inbox items (sidebar badge).
    public func inboxCount() async throws -> Int {
        let response = try await ctx.client
            .from("tasks")
            .select("id", head: true, count: .exact)
            .eq("space_id", value: ctx.spaceId.uuidString)
            .eq("status", value: TaskStatus.inbox.rawValue)
            .is("parent_task_id", value: nil)
            .execute()
        return response.count ?? 0
    }

    /// Full-text search over title + notes (the generated `search` tsvector).
    /// websearch_to_tsquery ANDs plain words and never throws on operator
    /// characters in user input — mirrors useSearch in apps/web/src/lib/data.ts.
    public func search(_ term: String) async throws -> [TaskItem] {
        let trimmed = term.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return [] }
        return try await ctx.client
            .from("tasks")
            .select()
            .eq("space_id", value: ctx.spaceId.uuidString)
            .textSearch("search", query: trimmed, type: .websearch)
            .limit(50)
            .execute()
            .value
    }

    /// Same order as the subtask surfacing walk (sort_order, then created_at).
    public func subtasks(of parentId: UUID) async throws -> [TaskItem] {
        try await ctx.client
            .from("tasks")
            .select()
            .eq("parent_task_id", value: parentId.uuidString)
            .order("sort_order")
            .order("created_at")
            .execute()
            .value
    }

    /// Done/total sub-task counts for the given parents, aggregated
    /// client-side (matches how the web derives subtask stats).
    public func subtaskCounts(for taskIds: [UUID]) async throws -> [UUID: (done: Int, total: Int)] {
        guard !taskIds.isEmpty else { return [:] }
        struct Row: Decodable {
            let parentTaskId: UUID?
            let status: TaskStatus
        }
        let rows: [Row] = try await ctx.client
            .from("tasks")
            .select("parent_task_id, status")
            .in("parent_task_id", values: taskIds.map(\.uuidString))
            .execute()
            .value
        return Self.aggregateSubtaskCounts(rows.map { ($0.parentTaskId, $0.status) })
    }

    /// Pure aggregation helper (unit-tested). Public so views that already
    /// hold the full task list can derive counts without a second query.
    public static func aggregateSubtaskCounts(
        _ rows: [(parentTaskId: UUID?, status: TaskStatus)]
    ) -> [UUID: (done: Int, total: Int)] {
        var counts: [UUID: (done: Int, total: Int)] = [:]
        for row in rows {
            guard let parent = row.parentTaskId else { continue }
            var entry = counts[parent] ?? (0, 0)
            entry.total += 1
            if row.status == .done { entry.done += 1 }
            counts[parent] = entry
        }
        return counts
    }

    public func tasks(ids: [UUID]) async throws -> [TaskItem] {
        guard !ids.isEmpty else { return [] }
        return try await ctx.client
            .from("tasks")
            .select()
            .in("id", values: ids.map(\.uuidString))
            .execute()
            .value
    }

    public func task(id: UUID) async throws -> TaskItem {
        try await ctx.client
            .from("tasks")
            .select()
            .eq("id", value: id.uuidString)
            .single()
            .execute()
            .value
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

    /// Batch insert for importers. Rows colliding on (space_id, external_ref)
    /// are silently skipped, so re-running an import is safe. Returns only the
    /// rows actually inserted.
    public func createMany(_ payloads: [NewTaskPayload]) async throws -> [TaskItem] {
        guard !payloads.isEmpty else { return [] }
        return try await ctx.client
            .from("tasks")
            .upsert(payloads, onConflict: "space_id,external_ref", ignoreDuplicates: true)
            .select()
            .execute()
            .value
    }

    /// Existing imported tasks in the space, keyed by external_ref — used to
    /// skip duplicates and re-link subtasks on repeated imports.
    public func externalRefs() async throws -> [String: UUID] {
        struct Row: Decodable {
            let id: UUID
            let externalRef: String?
        }
        let rows: [Row] = try await ctx.client
            .from("tasks")
            .select("id, external_ref")
            .eq("space_id", value: ctx.spaceId.uuidString)
            .not("external_ref", operator: .is, value: "null")
            .execute()
            .value
        return Dictionary(
            rows.compactMap { row in row.externalRef.map { ($0, row.id) } },
            uniquingKeysWith: { first, _ in first })
    }

    /// Quick capture: run the text through the natural-language parser and
    /// insert the result. `parentCandidates` are the tasks a `#Parent` hint
    /// may resolve against (open, top-level).
    public func capture(
        _ text: String,
        parentCandidates: [TaskItem] = [],
        now: Date = Date()
    ) async throws -> TaskItem {
        let parsed = parseQuickAdd(text, now: now)
        let payload = NewTaskPayload(
            parsed: parsed, spaceId: ctx.spaceId, createdBy: ctx.userId,
            parentCandidates: parentCandidates)
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

    /// Persist drag-and-drop ordering via the reorder_tasks RPC — one round
    /// trip even when a never-ordered list gets renumbered. Mirrors the
    /// web's useReorderTasks.
    public func reorder(_ patches: [OrderPatch]) async throws {
        guard !patches.isEmpty else { return }
        struct Params: Encodable {
            let pIds: [UUID]
            let pOrders: [Double]
        }
        try await ctx.client
            .rpc(
                "reorder_tasks",
                params: Params(pIds: patches.map(\.id), pOrders: patches.map(\.sortOrder))
            )
            .execute()
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
