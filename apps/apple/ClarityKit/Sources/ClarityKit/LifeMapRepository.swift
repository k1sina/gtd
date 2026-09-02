import ClarityCore
import Foundation
import Supabase

/// The lifetime map: the horizon it is drawn against and the experiences
/// placed on it. User-scoped (not space-scoped) like life values and goals —
/// RLS filters by user_id, so no space filter is needed. Saves mirror the
/// web's useSaveLifeExperience: insert when there is no id, else update;
/// nullable fields are always written so edits can clear them.
public struct LifeMapRepository: Sendable {
    let ctx: RepositoryContext

    public init(_ ctx: RepositoryContext) {
        self.ctx = ctx
    }

    // MARK: Horizon

    /// nil until the user sets a birth date — the map has no scale before that.
    public func horizon() async throws -> LifeHorizon? {
        let rows: [LifeHorizon] = try await ctx.client
            .from("life_horizon")
            .select()
            .limit(1)
            .execute()
            .value
        return rows.first
    }

    /// Upserts the single per-user row (user_id is its primary key).
    @discardableResult
    public func saveHorizon(
        birthDate: String?, lifeExpectancy: Int
    ) async throws -> LifeHorizon {
        struct Fields: Encodable {
            let userId: UUID
            let birthDate: String?
            let lifeExpectancy: Int

            enum CodingKeys: String, CodingKey {
                case userId, birthDate, lifeExpectancy
            }

            func encode(to encoder: Encoder) throws {
                var c = encoder.container(keyedBy: CodingKeys.self)
                try c.encode(userId, forKey: .userId)
                try c.encode(birthDate, forKey: .birthDate) // null clears
                try c.encode(lifeExpectancy, forKey: .lifeExpectancy)
            }
        }
        return try await ctx.client
            .from("life_horizon")
            .upsert(
                Fields(
                    userId: ctx.userId, birthDate: birthDate,
                    lifeExpectancy: lifeExpectancy),
                onConflict: "user_id")
            .select().single().execute().value
    }

    // MARK: Experiences

    public func experiences() async throws -> [LifeExperience] {
        let rows: [LifeExperience] = try await ctx.client
            .from("life_experiences")
            .select()
            .order("sort_order")
            .order("created_at")
            .execute()
            .value
        return rows.sorted(by: experienceIsOrderedBefore)
    }

    @discardableResult
    public func saveExperience(
        id: UUID?, title: String, notes: String?, category: ExperienceCategory,
        status: ExperienceStatus, targetAgeStart: Int?, targetAgeEnd: Int?,
        withWhom: String?, valueId: UUID?, livedOn: String? = nil,
        reflection: String? = nil
    ) async throws -> LifeExperience {
        struct Fields: Encodable {
            let title: String
            let notes: String?
            let category: ExperienceCategory
            let status: ExperienceStatus
            let targetAgeStart: Int?
            let targetAgeEnd: Int?
            let withWhom: String?
            let valueId: UUID?
            let livedOn: String?
            let reflection: String?
            var userId: UUID?

            enum CodingKeys: String, CodingKey {
                case title, notes, category, status, targetAgeStart, targetAgeEnd,
                    withWhom, valueId, livedOn, reflection, userId
            }

            func encode(to encoder: Encoder) throws {
                var c = encoder.container(keyedBy: CodingKeys.self)
                try c.encode(title, forKey: .title)
                try c.encode(notes, forKey: .notes) // null clears
                try c.encode(category, forKey: .category)
                try c.encode(status, forKey: .status)
                try c.encode(targetAgeStart, forKey: .targetAgeStart) // null unplaces
                try c.encode(targetAgeEnd, forKey: .targetAgeEnd) // null unplaces
                try c.encode(withWhom, forKey: .withWhom) // null clears
                try c.encode(valueId, forKey: .valueId) // null clears
                try c.encode(livedOn, forKey: .livedOn) // null clears
                try c.encode(reflection, forKey: .reflection) // null clears
                try c.encodeIfPresent(userId, forKey: .userId)
            }
        }
        let fields = Fields(
            title: title, notes: notes, category: category, status: status,
            targetAgeStart: targetAgeStart, targetAgeEnd: targetAgeEnd,
            withWhom: withWhom, valueId: valueId, livedOn: livedOn,
            reflection: reflection)
        if let id {
            return try await ctx.client
                .from("life_experiences")
                .update(fields)
                .eq("id", value: id.uuidString)
                .select().single().execute().value
        }
        var insert = fields
        insert.userId = ctx.userId
        return try await ctx.client
            .from("life_experiences")
            .insert(insert)
            .select().single().execute().value
    }

    public func deleteExperience(id: UUID) async throws {
        try await ctx.client
            .from("life_experiences")
            .delete()
            .eq("id", value: id.uuidString)
            .execute()
    }
}
