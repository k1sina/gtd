import ClarityCore
import Foundation
import Supabase

/// Reads assistant conversation history straight from Supabase; sending a
/// message goes through the web API (ClarityAPI), which owns the agent loop.
public struct ChatRepository: Sendable {
    let ctx: RepositoryContext

    public init(_ ctx: RepositoryContext) {
        self.ctx = ctx
    }

    public func sessions(limit: Int = 30) async throws -> [ChatSession] {
        try await ctx.client
            .from("chat_sessions")
            .select()
            .order("updated_at", ascending: false)
            .limit(limit)
            .execute()
            .value
    }

    public func messages(sessionId: UUID) async throws -> [ChatMessage] {
        try await ctx.client
            .from("chat_messages")
            .select()
            .eq("session_id", value: sessionId.uuidString)
            .order("created_at")
            .execute()
            .value
    }

    public func deleteSession(id: UUID) async throws {
        try await ctx.client
            .from("chat_sessions")
            .delete()
            .eq("id", value: id.uuidString)
            .execute()
    }
}
