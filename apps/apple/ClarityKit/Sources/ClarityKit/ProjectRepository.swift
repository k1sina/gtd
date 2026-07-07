import ClarityCore
import Foundation
import Supabase

public struct ProjectRepository: Sendable {
    let ctx: RepositoryContext

    public init(_ ctx: RepositoryContext) {
        self.ctx = ctx
    }

    public func projects() async throws -> [Project] {
        try await ctx.client
            .from("projects")
            .select()
            .eq("space_id", value: ctx.spaceId.uuidString)
            .order("sort_order")
            .order("created_at")
            .execute()
            .value
    }

    public func create(name: String, outcome: String? = nil) async throws -> Project {
        struct Payload: Encodable {
            let spaceId: UUID
            let name: String
            let outcome: String?
        }
        return try await ctx.client
            .from("projects")
            .insert(Payload(spaceId: ctx.spaceId, name: name, outcome: outcome))
            .select()
            .single()
            .execute()
            .value
    }
}

/// A project plus what the task list says about it. `stalled` = active with
/// no next action — same definition as the web assistant's list_projects.
public struct ProjectSummary: Identifiable, Sendable {
    public let project: Project
    public let openTasks: Int
    public let doneTasks: Int
    public let stalled: Bool

    public var id: UUID { project.id }

    public static func summarize(projects: [Project], tasks: [TaskItem]) -> [ProjectSummary] {
        projects.map { project in
            let projectTasks = tasks.filter { $0.projectId == project.id }
            let open = projectTasks.filter { $0.status != .done && $0.status != .cancelled }
            let done = projectTasks.count - open.count
            let hasNext = open.contains { $0.status == .next }
            return ProjectSummary(
                project: project,
                openTasks: open.count,
                doneTasks: done,
                stalled: project.status == "active" && !hasNext
            )
        }
    }
}
