import ClarityCore
import Foundation
import Supabase

public struct AreaRepository: Sendable {
    let ctx: RepositoryContext

    public init(_ ctx: RepositoryContext) {
        self.ctx = ctx
    }

    public func areas() async throws -> [Area] {
        try await ctx.client
            .from("areas")
            .select()
            .eq("space_id", value: ctx.spaceId.uuidString)
            .order("sort_order")
            .order("created_at")
            .execute()
            .value
    }

    public func create(name: String) async throws -> Area {
        struct Payload: Encodable {
            let spaceId: UUID
            let name: String
        }
        return try await ctx.client
            .from("areas")
            .insert(Payload(spaceId: ctx.spaceId, name: name))
            .select()
            .single()
            .execute()
            .value
    }
}
