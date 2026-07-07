import Foundation

// Natural-language quick-add parsing — mirrors packages/shared/src/nlparse.ts.
// Keep the two implementations in sync; the vitest suite is the contract.
//
//   "Call mom tomorrow at 3pm @phone #Family !urgent ~15m every week"
//
// Porting note: the TypeScript version anchors fragments with a `(?<=\s)`
// lookbehind. The input is always padded with spaces, so every lookbehind is
// equivalent to consuming one literal `\s` and replacing the whole match with
// a single space — which is what the patterns below do (no lookbehind needed).
// Rule order is load-bearing (recurrence must run before bare-weekday dates).

public struct ParsedQuickAdd: Equatable, Sendable {
    public var title: String
    public var dueAt: Date?
    public var tags: [String]
    public var projectHint: String?
    public var urgency: Int?
    public var importance: Int?
    public var someday: Bool
    public var estimatedMinutes: Int?
    public var recurrenceRule: String?
}

private let weekdayNames = [
    "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
]

public func parseQuickAdd(
    _ input: String,
    now: Date = Date(),
    calendar: Calendar = .current
) -> ParsedQuickAdd {
    var text = " \(input.trimmingCharacters(in: .whitespacesAndNewlines)) "

    var out = ParsedQuickAdd(
        title: "",
        dueAt: nil,
        tags: [],
        projectHint: nil,
        urgency: nil,
        importance: nil,
        someday: false,
        estimatedMinutes: nil,
        recurrenceRule: nil
    )

    func startOfDay(_ d: Date) -> Date { calendar.startOfDay(for: d) }
    func addDays(_ d: Date, _ n: Int) -> Date {
        calendar.date(byAdding: .day, value: n, to: d)!
    }
    /// 0 = Monday … 6 = Sunday.
    func isoWeekday(_ d: Date) -> Int {
        (calendar.component(.weekday, from: d) + 5) % 7
    }
    func upcomingWeekday(from: Date, target: Int, forceNextWeek: Bool) -> Date {
        var diff = (target - isoWeekday(from) + 7) % 7
        if diff == 0 && forceNextWeek { diff = 7 }
        return addDays(startOfDay(from), diff)
    }
    /// Same rollover semantics as JS `setHours` (hours > 23 spill into days).
    func atTime(_ day: Date, hour: Int, minute: Int) -> Date {
        calendar.date(byAdding: DateComponents(hour: hour, minute: minute), to: startOfDay(day))!
    }

    /// Replace the first match of `pattern` with a single space and hand the
    /// capture groups (nil when unmatched) to `onMatch`.
    func eat(_ pattern: String, onMatch: ([String?]) -> Void) {
        let re = try! NSRegularExpression(pattern: pattern, options: [.caseInsensitive])
        let full = NSRange(text.startIndex..., in: text)
        guard let m = re.firstMatch(in: text, range: full) else { return }
        var groups: [String?] = []
        for i in 0..<m.numberOfRanges {
            let r = m.range(at: i)
            if r.location != NSNotFound, let range = Range(r, in: text) {
                groups.append(String(text[range]))
            } else {
                groups.append(nil)
            }
        }
        onMatch(groups)
        if let whole = Range(m.range, in: text) {
            text.replaceSubrange(whole, with: " ")
        }
    }

    // --- tags & project ------------------------------------------------------
    do {
        let re = try! NSRegularExpression(pattern: #"\s@([\w-]+)"#)
        let full = NSRange(text.startIndex..., in: text)
        for m in re.matches(in: text, range: full) {
            if let r = Range(m.range(at: 1), in: text) {
                out.tags.append(text[r].lowercased())
            }
        }
        text = re.stringByReplacingMatches(in: text, range: full, withTemplate: " ")
    }

    eat(#"\s#([\w][\w-]*)"#) { m in
        out.projectHint = m[1]
    }

    // --- priority ------------------------------------------------------------
    eat(#"\s!urgent\b"#) { _ in out.urgency = 4 }
    eat(#"\s!important\b"#) { _ in out.importance = 4 }
    eat(#"\s!someday\b"#) { _ in out.someday = true }

    // --- estimate ~30m ~2h ~1h30m ---------------------------------------------
    eat(#"\s~(?:(\d+)h)?(?:(\d+)m?)?(?=\s)"#) { m in
        let hours = m[1].flatMap { Int($0) } ?? 0
        let mins = m[2].flatMap { Int($0) } ?? 0
        if hours > 0 || mins > 0 { out.estimatedMinutes = hours * 60 + mins }
    }

    // --- recurrence ------------------------------------------------------------
    let dayAlt = weekdayNames.joined(separator: "|")
    eat(#"\severy\s+(?:(\d+)\s+)?(day|week|month|year|weekday|"# + dayAlt + #")s?\b"#) { m in
        let interval = m[1].flatMap { Int($0) } ?? 1
        let unit = m[2]!.lowercased()
        var rule: RecurrenceRule?
        switch unit {
        case "day": rule = RecurrenceRule(freq: .daily, interval: interval)
        case "week": rule = RecurrenceRule(freq: .weekly, interval: interval)
        case "month": rule = RecurrenceRule(freq: .monthly, interval: interval)
        case "year": rule = RecurrenceRule(freq: .yearly, interval: interval)
        case "weekday": rule = RecurrenceRule(freq: .weekly, interval: 1, byday: [0, 1, 2, 3, 4])
        default:
            if let dayIdx = weekdayNames.firstIndex(of: unit) {
                rule = RecurrenceRule(freq: .weekly, interval: interval, byday: [dayIdx])
            }
        }
        if let rule { out.recurrenceRule = formatRule(rule) }
    }

    // --- time of day -----------------------------------------------------------
    var timeParts: (h: Int, m: Int)?
    eat(#"\s(?:at\s+)?(\d{1,2}):(\d{2})\s*(am|pm)?(?=[\s,.])"#) { m in
        var h = Int(m[1]!)!
        let ampm = m[3]?.lowercased()
        if ampm == "pm" && h < 12 { h += 12 }
        if ampm == "am" && h == 12 { h = 0 }
        timeParts = (h, Int(m[2]!)!)
    }
    if timeParts == nil {
        eat(#"\sat\s+(\d{1,2})\s*(am|pm)?(?=[\s,.])"#) { m in
            var h = Int(m[1]!)!
            let ampm = m[2]?.lowercased()
            if ampm == "pm" && h < 12 { h += 12 }
            if ampm == "am" && h == 12 { h = 0 }
            timeParts = (h, 0)
        }
    }
    if timeParts == nil {
        eat(#"\s(\d{1,2})(am|pm)(?=[\s,.])"#) { m in
            var h = Int(m[1]!)!
            if m[2]!.lowercased() == "pm" && h < 12 { h += 12 }
            if m[2]!.lowercased() == "am" && h == 12 { h = 0 }
            timeParts = (h, 0)
        }
    }

    // --- date ------------------------------------------------------------------
    var dueDay: Date?
    eat(#"\stoday\b"#) { _ in
        dueDay = startOfDay(now)
    }
    if dueDay == nil {
        eat(#"\stonight\b"#) { _ in
            dueDay = startOfDay(now)
            if timeParts == nil { timeParts = (20, 0) }
        }
    }
    if dueDay == nil {
        eat(#"\stomorrow\b"#) { _ in
            dueDay = addDays(startOfDay(now), 1)
        }
    }
    if dueDay == nil {
        eat(#"\snext\s+week\b"#) { _ in
            // Next Monday
            let wd = isoWeekday(now)
            let offset = ((7 - wd) % 7) + (wd == 0 ? 7 : 0)
            dueDay = addDays(startOfDay(now), offset == 0 ? 7 : offset)
        }
    }
    if dueDay == nil {
        eat(#"\snext\s+month\b"#) { _ in
            let firstOfMonth = calendar.date(
                from: calendar.dateComponents([.year, .month], from: startOfDay(now)))!
            dueDay = calendar.date(byAdding: .month, value: 1, to: firstOfMonth)
        }
    }
    if dueDay == nil {
        eat(#"\s(next\s+)?("# + dayAlt + #")\b"#) { m in
            let target = weekdayNames.firstIndex(of: m[2]!.lowercased())!
            var d = upcomingWeekday(from: now, target: target, forceNextWeek: false)
            // A weekday naming today means the coming one, not today.
            if d == startOfDay(now) { d = addDays(d, 7) }
            dueDay = d
        }
    }
    if dueDay == nil {
        eat(#"\sin\s+(\d+)\s+(day|week|month)s?\b"#) { m in
            let n = Int(m[1]!)!
            switch m[2]!.lowercased() {
            case "day": dueDay = addDays(startOfDay(now), n)
            case "week": dueDay = addDays(startOfDay(now), n * 7)
            default:
                // JS setMonth overflows (Jan 31 + 1mo = Mar 3); Calendar clamps
                // to the month's last day. Divergence accepted — untested edge.
                dueDay = calendar.date(byAdding: .month, value: n, to: startOfDay(now))
            }
        }
    }

    if let dueDay {
        if let tp = timeParts {
            out.dueAt = atTime(dueDay, hour: tp.h, minute: tp.m)
        } else {
            out.dueAt = atTime(dueDay, hour: 17, minute: 0) // default end-of-workday
        }
    } else if let tp = timeParts {
        var due = atTime(now, hour: tp.h, minute: tp.m)
        if due <= now { due = addDays(due, 1) }
        out.dueAt = due
    }

    out.title = text
        .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
        .trimmingCharacters(in: .whitespaces)
    return out
}
