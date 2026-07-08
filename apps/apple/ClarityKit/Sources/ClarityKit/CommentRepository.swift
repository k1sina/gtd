import ClarityCore
import Foundation
import Supabase

/// A comment joined with the author's display name.
public struct TaskCommentInfo: Decodable, Identifiable, Hashable, Sendable {
    public struct Author: Decodable, Hashable, Sendable {
        public let displayName: String
    }

    public let id: UUID
    public let taskId: UUID
    public let userId: UUID
    public let body: String
    public let createdAt: Date
    public let profile: Author
}

public struct CommentRepository: Sendable {
    let ctx: RepositoryContext

    public init(_ ctx: RepositoryContext) {
        self.ctx = ctx
    }

    public func comments(taskId: UUID) async throws -> [TaskCommentInfo] {
        try await ctx.client
            .from("task_comments")
            .select("id, task_id, user_id, body, created_at, profile:profiles(display_name)")
            .eq("task_id", value: taskId.uuidString)
            .order("created_at")
            .execute()
            .value
    }

    @discardableResult
    public func add(taskId: UUID, body: String) async throws -> TaskCommentInfo {
        struct Payload: Encodable {
            let spaceId: UUID
            let taskId: UUID
            let userId: UUID
            let body: String
        }
        return try await ctx.client
            .from("task_comments")
            .insert(Payload(spaceId: ctx.spaceId, taskId: taskId, userId: ctx.userId, body: body))
            .select("id, task_id, user_id, body, created_at, profile:profiles(display_name)")
            .single()
            .execute()
            .value
    }
}
