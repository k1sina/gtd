import ClarityCore
import Foundation
import Supabase

/// A member row joined with its profile (for the sharing settings list).
public struct SpaceMemberInfo: Decodable, Identifiable, Hashable, Sendable {
    public struct MemberProfile: Decodable, Hashable, Sendable {
        public let displayName: String
        public let email: String
    }

    public let userId: UUID
    public let role: SpaceRole
    public let profile: MemberProfile

    public var id: UUID { userId }
}

public struct SpaceRepository: Sendable {
    let ctx: RepositoryContext

    public init(_ ctx: RepositoryContext) {
        self.ctx = ctx
    }

    public func members() async throws -> [SpaceMemberInfo] {
        try await ctx.client
            .from("space_members")
            .select("user_id, role, profile:profiles(display_name, email)")
            .eq("space_id", value: ctx.spaceId.uuidString)
            .execute()
            .value
    }

    /// Create a shared space; the on_space_created trigger adds the creator
    /// as owner.
    public func createSpace(name: String) async throws -> Space {
        struct Payload: Encodable {
            let name: String
            let isPersonal: Bool
            let createdBy: UUID
        }
        return try await ctx.client
            .from("spaces")
            .insert(Payload(name: name, isPersonal: false, createdBy: ctx.userId))
            .select()
            .single()
            .execute()
            .value
    }

    public func invites() async throws -> [SpaceInvite] {
        try await ctx.client
            .from("space_invites")
            .select()
            .eq("space_id", value: ctx.spaceId.uuidString)
            .order("created_at", ascending: false)
            .execute()
            .value
    }

    public func createInvite(email: String) async throws -> SpaceInvite {
        struct Payload: Encodable {
            let spaceId: UUID
            let email: String
            let invitedBy: UUID
        }
        return try await ctx.client
            .from("space_invites")
            .insert(Payload(spaceId: ctx.spaceId, email: email, invitedBy: ctx.userId))
            .select()
            .single()
            .execute()
            .value
    }

    public func revokeInvite(id: UUID) async throws {
        try await ctx.client
            .from("space_invites")
            .delete()
            .eq("id", value: id.uuidString)
            .execute()
    }
}
