import Foundation

// Local-time date helpers mirroring apps/web/src/lib/format.ts, plus the
// streak calculations from the web habits/reviews pages. Namespaced under
// `Dates` to avoid clashing with the private helpers in Recurrence/QuickAdd.

public enum Dates {
    public static func startOfDay(_ d: Date, calendar: Calendar = .current) -> Date {
        calendar.startOfDay(for: d)
    }

    public static func addDays(_ d: Date, _ n: Int, calendar: Calendar = .current) -> Date {
        calendar.date(byAdding: .day, value: n, to: d) ?? d
    }

    /// 0 = Monday … 6 = Sunday.
    public static func isoWeekday(_ d: Date, calendar: Calendar = .current) -> Int {
        (calendar.component(.weekday, from: d) + 5) % 7
    }

    public static func startOfWeek(_ d: Date, calendar: Calendar = .current) -> Date {
        addDays(startOfDay(d, calendar: calendar), -isoWeekday(d, calendar: calendar), calendar: calendar)
    }

    /// "yyyy-MM-dd" in local time (matches web `toDateKey` and Postgres `date`).
    public static func dateKey(_ d: Date, calendar: Calendar = .current) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: d)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }
}

public struct DatePeriod: Hashable, Sendable {
    public let start: String
    public let end: String

    public init(start: String, end: String) {
        self.start = start
        self.end = end
    }
}

/// ISO week (Mon..Sun) containing `d`, as date keys.
public func weekPeriod(for d: Date, calendar: Calendar = .current) -> DatePeriod {
    let start = Dates.startOfWeek(d, calendar: calendar)
    return DatePeriod(
        start: Dates.dateKey(start, calendar: calendar),
        end: Dates.dateKey(Dates.addDays(start, 6, calendar: calendar), calendar: calendar)
    )
}

public func quarterOf(_ d: Date, calendar: Calendar = .current) -> (year: Int, quarter: Int) {
    let c = calendar.dateComponents([.year, .month], from: d)
    return (year: c.year ?? 0, quarter: ((c.month ?? 1) - 1) / 3 + 1)
}

public func quarterPeriod(year: Int, quarter: Int, calendar: Calendar = .current) -> DatePeriod {
    var comps = DateComponents()
    comps.year = year
    comps.month = (quarter - 1) * 3 + 1
    comps.day = 1
    let start = calendar.date(from: comps) ?? Date()
    let nextQuarter = calendar.date(byAdding: .month, value: 3, to: start) ?? start
    let end = Dates.addDays(nextQuarter, -1, calendar: calendar)
    return DatePeriod(
        start: Dates.dateKey(start, calendar: calendar),
        end: Dates.dateKey(end, calendar: calendar)
    )
}

/// Buckets for the Scheduled view — mirrors the grouping in the web
/// scheduled page (Overdue / Today / Next 7 days / Later).
public enum ScheduledBucket: String, CaseIterable, Sendable {
    case overdue, today, week, later

    public var label: String {
        switch self {
        case .overdue: return "Overdue"
        case .today: return "Today"
        case .week: return "Next 7 days"
        case .later: return "Later"
        }
    }
}

public func scheduledBucket(
    for scheduledDate: Date, now: Date, calendar: Calendar = .current
) -> ScheduledBucket {
    let today = Dates.startOfDay(now, calendar: calendar)
    let tomorrow = Dates.addDays(today, 1, calendar: calendar)
    let nextWeek = Dates.addDays(today, 7, calendar: calendar)
    if scheduledDate < today { return .overdue }
    if scheduledDate < tomorrow { return .today }
    if scheduledDate < nextWeek { return .week }
    return .later
}

/// Consecutive due-days logged, counting back from today. A missed *today*
/// doesn't break the streak until the day is over. Mirrors the web
/// `habitStreak` in components/habit-strip.tsx.
public func habitStreak(
    habit: Habit, logDates: Set<String>, today: Date, calendar: Calendar = .current
) -> Int {
    var streak = 0
    var day = today
    if habit.isDue(on: day, calendar: calendar),
       logDates.contains(Dates.dateKey(day, calendar: calendar)) {
        streak += 1
    }
    day = Dates.addDays(day, -1, calendar: calendar)
    for _ in 0..<365 {
        if habit.isDue(on: day, calendar: calendar) {
            guard logDates.contains(Dates.dateKey(day, calendar: calendar)) else { break }
            streak += 1
        }
        day = Dates.addDays(day, -1, calendar: calendar)
    }
    return streak
}

/// Consecutive weeks (ending this or last week) with a completed weekly
/// review. `completedPeriodStarts` holds `period_start` date keys. Mirrors
/// `weeklyStreak` in the web review hub.
public func weeklyReviewStreak(
    completedPeriodStarts: Set<String>, now: Date, calendar: Calendar = .current
) -> Int {
    var streak = 0
    var cursor = now
    if completedPeriodStarts.contains(weekPeriod(for: cursor, calendar: calendar).start) {
        streak += 1
    }
    cursor = Dates.addDays(cursor, -7, calendar: calendar)
    for _ in 0..<260 {
        guard completedPeriodStarts.contains(weekPeriod(for: cursor, calendar: calendar).start) else { break }
        streak += 1
        cursor = Dates.addDays(cursor, -7, calendar: calendar)
    }
    return streak
}
