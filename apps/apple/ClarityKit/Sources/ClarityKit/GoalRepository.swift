import ClarityCore
import Foundation
import Supabase

/// Life values and quarterly goals. User-scoped (not space-scoped) — RLS
/// filters by user_id, so no space filter is needed. Saves mirror the web's
/// useSaveLifeValue/useSaveGoal: insert when there is no id, else update;
/// nullable fields are always written so edits can clear them.
public struct GoalRepository: Sendable {
    let ctx: RepositoryContext

    public init(_ ctx: RepositoryContext) {
        self.ctx = ctx
    }

    // MARK: Life values

    public func lifeValues() async throws -> [LifeValue] {
        try await ctx.client
            .from("life_values")
            .select()
            .order("sort_order")
            .order("created_at")
            .execute()
            .value
    }

    public func saveLifeValue(
        id: UUID?, name: String, description: String?
    ) async throws -> LifeValue {
        struct Fields: Encodable {
            let name: String
            let description: String?
            var userId: UUID?

            enum CodingKeys: String, CodingKey { case name, description, userId }

            func encode(to encoder: Encoder) throws {
                var c = encoder.container(keyedBy: CodingKeys.self)
                try c.encode(name, forKey: .name)
                try c.encode(description, forKey: .description) // null clears
                try c.encodeIfPresent(userId, forKey: .userId)
            }
        }
        if let id {
            return try await ctx.client
                .from("life_values")
                .update(Fields(name: name, description: description))
                .eq("id", value: id.uuidString)
                .select().single().execute().value
        }
        return try await ctx.client
            .from("life_values")
            .insert(Fields(name: name, description: description, userId: ctx.userId))
            .select().single().execute().value
    }

    public func deleteLifeValue(id: UUID) async throws {
        try await ctx.client
            .from("life_values")
            .delete()
            .eq("id", value: id.uuidString)
            .execute()
    }

    // MARK: Goals

    public func goals() async throws -> [Goal] {
        try await ctx.client
            .from("goals")
            .select()
            .order("year", ascending: false)
            .order("quarter", ascending: false)
            .order("sort_order")
            .execute()
            .value
    }

    public func saveGoal(
        id: UUID?, title: String, description: String?, year: Int, quarter: Int,
        valueId: UUID?, status: GoalStatus = .active, score: Int? = nil,
        reflection: String? = nil
    ) async throws -> Goal {
        struct Fields: Encodable {
            let title: String
            let description: String?
            let year: Int
            let quarter: Int
            let valueId: UUID?
            let status: GoalStatus
            let score: Int?
            let reflection: String?
            var userId: UUID?

            enum CodingKeys: String, CodingKey {
                case title, description, year, quarter, valueId, status, score,
                    reflection, userId
            }

            func encode(to encoder: Encoder) throws {
                var c = encoder.container(keyedBy: CodingKeys.self)
                try c.encode(title, forKey: .title)
                try c.encode(description, forKey: .description) // null clears
                try c.encode(year, forKey: .year)
                try c.encode(quarter, forKey: .quarter)
                try c.encode(valueId, forKey: .valueId) // null clears
                try c.encode(status, forKey: .status)
                try c.encode(score, forKey: .score) // null clears
                try c.encode(reflection, forKey: .reflection) // null clears
                try c.encodeIfPresent(userId, forKey: .userId)
            }
        }
        let fields = Fields(
            title: title, description: description, year: year, quarter: quarter,
            valueId: valueId, status: status, score: score, reflection: reflection)
        if let id {
            return try await ctx.client
                .from("goals")
                .update(fields)
                .eq("id", value: id.uuidString)
                .select().single().execute().value
        }
        var insert = fields
        insert.userId = ctx.userId
        return try await ctx.client
            .from("goals")
            .insert(insert)
            .select().single().execute().value
    }

    public func deleteGoal(id: UUID) async throws {
        try await ctx.client
            .from("goals")
            .delete()
            .eq("id", value: id.uuidString)
            .execute()
    }
}
