import Foundation
import Testing
@testable import ClarityCore

// Mirrors the Vitest suites in packages/shared/test — the expected values
// must stay identical across both implementations.
// (Swift Testing rather than XCTest so the suite also runs on machines with
// only the Command Line Tools — see scripts/test-swift.sh.)

private struct StubTask: Prioritizable {
    var urgency: Int
    var importance: Int
    var dueAt: Date?
    var deferUntil: Date?
}

func date(_ iso: String) -> Date {
    let formatter = DateFormatter()
    formatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ss"
    formatter.timeZone = .current
    return formatter.date(from: iso)!
}

@Suite struct PriorityTests {
    @Test func quadrants() {
        #expect(quadrant(urgency: 4, importance: 4) == .doFirst)
        #expect(quadrant(urgency: 1, importance: 4) == .schedule)
        #expect(quadrant(urgency: 4, importance: 1) == .delegate)
        #expect(quadrant(urgency: 1, importance: 1) == .eliminate)
        #expect(quadrant(urgency: 3, importance: 3) == .doFirst)
        #expect(quadrant(urgency: 2, importance: 3) == .schedule)
    }

    @Test func importanceDominatesUrgency() {
        let now = date("2026-07-07T12:00:00")
        let important = priorityScore(
            StubTask(urgency: 1, importance: 4, dueAt: nil, deferUntil: nil), now: now)
        let urgent = priorityScore(
            StubTask(urgency: 4, importance: 1, dueAt: nil, deferUntil: nil), now: now)
        #expect(important > urgent)
    }

    @Test func overdueBoost() {
        let now = date("2026-07-07T12:00:00")
        let base = StubTask(urgency: 2, importance: 2, dueAt: nil, deferUntil: nil)
        var overdue = base; overdue.dueAt = date("2026-07-01T12:00:00")
        var nextWeek = base; nextWeek.dueAt = date("2026-07-20T12:00:00")
        #expect(priorityScore(overdue, now: now) > priorityScore(nextWeek, now: now))
    }
}

@Suite struct RecurrenceTests {
    // 2026-07-07 is a Tuesday.
    let anchor = date("2026-07-07T09:00:00")

    @Test func parseFormatRoundTrip() {
        let rule = parseRule("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE")
        #expect(rule == RecurrenceRule(freq: .weekly, interval: 2, byday: [0, 2]))
        #expect(formatRule(rule!) == "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE")
        #expect(parseRule("FREQ=HOURLY") == nil)
    }

    @Test func daily() {
        #expect(
            nextOccurrence(rule: "FREQ=DAILY;INTERVAL=1", anchor: anchor)
                == date("2026-07-08T09:00:00"))
        #expect(
            nextOccurrence(rule: "FREQ=DAILY;INTERVAL=3", anchor: anchor)
                == date("2026-07-10T09:00:00"))
    }

    @Test func weekly() {
        #expect(
            nextOccurrence(rule: "FREQ=WEEKLY;INTERVAL=1", anchor: anchor)
                == date("2026-07-14T09:00:00"))
        // From Tuesday, MO,FR -> Friday the 10th
        #expect(
            nextOccurrence(rule: "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,FR", anchor: anchor)
                == date("2026-07-10T09:00:00"))
        // Biweekly stays in the anchor week's phase
        #expect(
            nextOccurrence(rule: "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO", anchor: anchor)
                == date("2026-07-20T09:00:00"))
    }

    @Test func monthly() {
        #expect(
            nextOccurrence(rule: "FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=15", anchor: anchor)
                == date("2026-07-15T09:00:00"))
        // Jan 31 clamps to Feb 28
        #expect(
            nextOccurrence(rule: "FREQ=MONTHLY;INTERVAL=1", anchor: date("2026-01-31T10:00:00"))
                == date("2026-02-28T10:00:00"))
    }

    @Test func lateCompletionCatchesUp() {
        #expect(
            nextOccurrence(
                rule: "FREQ=WEEKLY;INTERVAL=1",
                anchor: anchor,
                after: date("2026-07-20T15:00:00"))
                == date("2026-07-21T09:00:00"))
    }

    @Test func describe() {
        #expect(describeRule("FREQ=DAILY;INTERVAL=1") == "every day")
        #expect(
            describeRule("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE")
                == "every 2 weeks on Mon, Wed")
    }
}
