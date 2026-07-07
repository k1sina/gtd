import Foundation

// RRULE-subset recurrence engine — mirrors packages/shared/src/recurrence.ts.
// Supported: FREQ=DAILY|WEEKLY|MONTHLY|YEARLY, INTERVAL=n,
//            BYDAY=MO,... (weekly), BYMONTHDAY=n (monthly).
// Weekday numbering everywhere: 0 = Monday … 6 = Sunday.

public struct RecurrenceRule: Equatable, Sendable {
    public enum Freq: String, Sendable {
        case daily = "DAILY", weekly = "WEEKLY", monthly = "MONTHLY", yearly = "YEARLY"
    }

    public var freq: Freq
    public var interval: Int
    public var byday: [Int]?
    public var bymonthday: Int?

    public init(freq: Freq, interval: Int = 1, byday: [Int]? = nil, bymonthday: Int? = nil) {
        self.freq = freq
        self.interval = max(1, interval)
        self.byday = byday
        self.bymonthday = bymonthday
    }
}

private let dayCodes = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"]

public func parseRule(_ rule: String) -> RecurrenceRule? {
    var parts: [String: String] = [:]
    let body = rule.hasPrefix("RRULE:") ? String(rule.dropFirst(6)) : rule
    for kv in body.split(separator: ";") {
        let pair = kv.split(separator: "=", maxSplits: 1)
        if pair.count == 2 {
            parts[pair[0].uppercased()] = pair[1].uppercased()
        }
    }
    guard let freqRaw = parts["FREQ"], let freq = RecurrenceRule.Freq(rawValue: freqRaw) else {
        return nil
    }
    var parsed = RecurrenceRule(freq: freq, interval: Int(parts["INTERVAL"] ?? "1") ?? 1)
    if let byday = parts["BYDAY"] {
        let days = byday.split(separator: ",")
            .compactMap { dayCodes.firstIndex(of: $0.trimmingCharacters(in: .whitespaces)) }
        if !days.isEmpty { parsed.byday = Array(Set(days)).sorted() }
    }
    if let dayString = parts["BYMONTHDAY"], let day = Int(dayString), (1...31).contains(day) {
        parsed.bymonthday = day
    }
    return parsed
}

public func formatRule(_ rule: RecurrenceRule) -> String {
    var s = "FREQ=\(rule.freq.rawValue);INTERVAL=\(rule.interval)"
    if let byday = rule.byday, !byday.isEmpty {
        s += ";BYDAY=" + byday.map { dayCodes[$0] }.joined(separator: ",")
    }
    if let bymonthday = rule.bymonthday {
        s += ";BYMONTHDAY=\(bymonthday)"
    }
    return s
}

private var calendar: Calendar {
    var cal = Calendar(identifier: .gregorian)
    cal.firstWeekday = 2 // Monday
    return cal
}

/// 0 = Monday … 6 = Sunday.
private func isoWeekday(_ date: Date) -> Int {
    (calendar.component(.weekday, from: date) + 5) % 7
}

private func startOfDay(_ date: Date) -> Date {
    calendar.startOfDay(for: date)
}

private func startOfWeek(_ date: Date) -> Date {
    calendar.date(byAdding: .day, value: -isoWeekday(date), to: startOfDay(date))!
}

private func addDays(_ date: Date, _ days: Int) -> Date {
    calendar.date(byAdding: .day, value: days, to: date)!
}

/// First occurrence strictly after `after`, anchored at `anchor` (the
/// occurrence being completed). Mirrors nextOccurrence in recurrence.ts.
public func nextOccurrence(
    rule ruleString: String,
    anchor: Date,
    after: Date? = nil
) -> Date? {
    guard let rule = parseRule(ruleString) else { return nil }
    let after = after ?? anchor

    let anchorTime = calendar.dateComponents([.hour, .minute], from: anchor)
    func withAnchorTime(_ day: Date) -> Date {
        calendar.date(
            bySettingHour: anchorTime.hour ?? 0,
            minute: anchorTime.minute ?? 0,
            second: 0,
            of: day
        )!
    }

    if rule.freq == .yearly {
        for i in 1...200 {
            if let candidate = calendar.date(byAdding: .year, value: i * rule.interval, to: anchor),
               candidate > after {
                return candidate
            }
        }
        return nil
    }

    let anchorDay = startOfDay(anchor)
    let anchorWeek = startOfWeek(anchor)
    let base = startOfDay(max(after, anchor))
    var cursor = (withAnchorTime(base) > after && base > anchorDay) ? base : addDays(base, 1)

    for _ in 0..<1600 {
        var matches = false
        switch rule.freq {
        case .daily:
            let diff = calendar.dateComponents([.day], from: anchorDay, to: cursor).day ?? 0
            matches = diff > 0 && diff % rule.interval == 0
        case .weekly:
            let weeks = (calendar.dateComponents([.day], from: anchorWeek, to: startOfWeek(cursor)).day ?? 0) / 7
            let days = rule.byday ?? [isoWeekday(anchorDay)]
            matches = weeks % rule.interval == 0 && days.contains(isoWeekday(cursor))
        case .monthly:
            let months = calendar.dateComponents([.month], from: anchorDay, to: cursor).month ?? 0
            let targetDay = rule.bymonthday ?? calendar.component(.day, from: anchorDay)
            let lastOfMonth = calendar.range(of: .day, in: .month, for: cursor)?.upperBound ?? 32
            let clamped = min(targetDay, lastOfMonth - 1)
            matches = months % rule.interval == 0
                && calendar.component(.day, from: cursor) == clamped
        case .yearly:
            break
        }
        if matches {
            let result = withAnchorTime(cursor)
            if result > after { return result }
        }
        cursor = addDays(cursor, 1)
    }
    return nil
}

public func describeRule(_ ruleString: String) -> String {
    guard let rule = parseRule(ruleString) else { return "custom" }
    let dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    func every(_ unit: String) -> String {
        rule.interval == 1 ? "every \(unit)" : "every \(rule.interval) \(unit)s"
    }
    switch rule.freq {
    case .daily: return every("day")
    case .weekly:
        guard let byday = rule.byday, !byday.isEmpty else { return every("week") }
        if byday.count == 7 { return every("day") }
        return every("week") + " on " + byday.map { dayNames[$0] }.joined(separator: ", ")
    case .monthly:
        if let day = rule.bymonthday { return every("month") + " on day \(day)" }
        return every("month")
    case .yearly: return every("year")
    }
}
