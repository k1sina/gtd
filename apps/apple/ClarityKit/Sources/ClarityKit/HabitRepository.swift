import ClarityCore
import Foundation
import Supabase

public struct HabitRepository: Sendable {
    let ctx: RepositoryContext

    public init(_ ctx: RepositoryContext) {
        self.ctx = ctx
    }

    /// Local-calendar day key matching the web's habit log convention.
    public static func dateKey(for date: Date = Date(), calendar: Calendar = .current) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year!, c.month!, c.day!)
    }

    public func habits() async throws -> [Habit] {
        try await ctx.client
            .from("habits")
            .select()
            .eq("space_id", value: ctx.spaceId.uuidString)
            .is("archived_at", value: nil)
            .order("sort_order")
            .execute()
            .value
    }

    public func logs(since dateKey: String) async throws -> [HabitLog] {
        try await ctx.client
            .from("habit_logs")
            .select()
            .eq("user_id", value: ctx.userId.uuidString)
            .gte("log_date", value: dateKey)
            .execute()
            .value
    }

    /// Log or un-log a habit for a day. Duplicate logs (unique violation
    /// 23505) are tolerated, matching the web's useToggleHabitLog.
    public func setLogged(habit: Habit, on dateKey: String, logged: Bool) async throws {
        if logged {
            do {
                try await ctx.client
                    .from("habit_logs")
                    .insert(HabitLog(habitId: habit.id, userId: ctx.userId, logDate: dateKey))
                    .execute()
            } catch let error as PostgrestError where error.code == "23505" {
                // Already logged — fine.
            }
        } else {
            try await ctx.client
                .from("habit_logs")
                .delete()
                .eq("habit_id", value: habit.id.uuidString)
                .eq("user_id", value: ctx.userId.uuidString)
                .eq("log_date", value: dateKey)
                .execute()
        }
    }
}
