import ClarityCore
import Foundation
import Supabase

/// The user's connected calendar account — non-secret columns only (tokens
/// never leave the server side of the web app).
public struct CalendarAccountInfo: Decodable, Identifiable, Hashable, Sendable {
    public let id: UUID
    public let provider: String
    public let email: String
    public let calendarId: String
    public let settings: PlannerConfig
}

public struct PlannerRepository: Sendable {
    let ctx: RepositoryContext

    public init(_ ctx: RepositoryContext) {
        self.ctx = ctx
    }

    /// Time blocks overlapping the given local day, excluding cancelled —
    /// mirrors the web's useTimeBlocks.
    public func timeBlocks(on day: Date, calendar: Calendar = .current) async throws -> [TimeBlock] {
        let start = Dates.startOfDay(day, calendar: calendar)
        let end = Dates.addDays(start, 1, calendar: calendar)
        let formatter = ISO8601DateFormatter()
        return try await ctx.client
            .from("time_blocks")
            .select()
            .gte("starts_at", value: formatter.string(from: start))
            .lt("starts_at", value: formatter.string(from: end))
            .neq("status", value: TimeBlockStatus.cancelled.rawValue)
            .order("starts_at")
            .execute()
            .value
    }

    public func calendarAccount() async throws -> CalendarAccountInfo? {
        let rows: [CalendarAccountInfo] = try await ctx.client
            .from("calendar_accounts")
            .select("id, provider, email, calendar_id, settings")
            .eq("provider", value: "google")
            .limit(1)
            .execute()
            .value
        return rows.first
    }

    /// Update the calendar selection and/or planning preferences. The
    /// `settings` jsonb keys are camelCase on the web, so the config is
    /// re-encoded with a plain encoder rather than the snake_case one.
    public func updateCalendarAccount(
        id: UUID, calendarId: String? = nil, settings: PlannerConfig? = nil
    ) async throws {
        var payload: [String: AnyJSON] = [:]
        if let calendarId {
            payload["calendar_id"] = .string(calendarId)
        }
        if let settings {
            let data = try JSONEncoder().encode(settings)
            payload["settings"] = try JSONDecoder().decode(AnyJSON.self, from: data)
        }
        guard !payload.isEmpty else { return }
        try await ctx.client
            .from("calendar_accounts")
            .update(payload)
            .eq("id", value: id.uuidString)
            .execute()
    }
}
