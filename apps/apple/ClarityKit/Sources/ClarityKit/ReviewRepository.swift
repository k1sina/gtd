import ClarityCore
import Foundation
import Supabase

/// Weekly + quarterly reviews. A review row is unique per
/// (user, type, period_start); flows start one on first save and patch it as
/// steps complete — mirrors the web's useSaveReview.
public struct ReviewRepository: Sendable {
    let ctx: RepositoryContext

    public init(_ ctx: RepositoryContext) {
        self.ctx = ctx
    }

    public func reviews(type: ReviewType? = nil, limit: Int = 50) async throws -> [Review] {
        var query = ctx.client
            .from("reviews")
            .select()
        if let type {
            query = query.eq("type", value: type.rawValue)
        }
        return try await query
            .order("period_start", ascending: false)
            .limit(limit)
            .execute()
            .value
    }

    /// The review for a specific period, if one was started.
    public func review(type: ReviewType, periodStart: String) async throws -> Review? {
        let rows: [Review] = try await ctx.client
            .from("reviews")
            .select()
            .eq("type", value: type.rawValue)
            .eq("period_start", value: periodStart)
            .limit(1)
            .execute()
            .value
        return rows.first
    }

    public func start(type: ReviewType, period: DatePeriod) async throws -> Review {
        struct Payload: Encodable {
            let userId: UUID
            let type: ReviewType
            let periodStart: String
            let periodEnd: String
        }
        return try await ctx.client
            .from("reviews")
            .insert(Payload(
                userId: ctx.userId, type: type,
                periodStart: period.start, periodEnd: period.end))
            .select()
            .single()
            .execute()
            .value
    }

    public func update(id: UUID, patch: ReviewPatch) async throws -> Review {
        try await ctx.client
            .from("reviews")
            .update(patch)
            .eq("id", value: id.uuidString)
            .select()
            .single()
            .execute()
            .value
    }
}

/// nil = leave the column alone; `clearCompletedAt` re-opens a review.
public struct ReviewPatch: Encodable, Sendable {
    public var checklist: [String: Bool]?
    public var notes: String?
    public var completedAt: Date?
    public var clearCompletedAt = false

    public init() {}

    private enum CodingKeys: String, CodingKey {
        case checklist, notes, completedAt
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(checklist, forKey: .checklist)
        try c.encodeIfPresent(notes, forKey: .notes)
        if clearCompletedAt { try c.encodeNil(forKey: .completedAt) }
        else { try c.encodeIfPresent(completedAt, forKey: .completedAt) }
    }
}
