import XCTest
@testable import ClarityCore

// Mirrors the Vitest suites in packages/shared/test — the expected values
// must stay identical across both implementations.

private struct StubTask: Prioritizable {
    var urgency: Int
    var importance: Int
    var dueAt: Date?
    var deferUntil: Date?
}

private func date(_ iso: String) -> Date {
    let formatter = DateFormatter()
    formatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ss"
    formatter.timeZone = .current
    return formatter.date(from: iso)!
}

final class PriorityTests: XCTestCase {
    func testQuadrants() {
        XCTAssertEqual(quadrant(urgency: 4, importance: 4), .doFirst)
        XCTAssertEqual(quadrant(urgency: 1, importance: 4), .schedule)
        XCTAssertEqual(quadrant(urgency: 4, importance: 1), .delegate)
        XCTAssertEqual(quadrant(urgency: 1, importance: 1), .eliminate)
        XCTAssertEqual(quadrant(urgency: 3, importance: 3), .doFirst)
        XCTAssertEqual(quadrant(urgency: 2, importance: 3), .schedule)
    }

    func testImportanceDominatesUrgency() {
        let now = date("2026-07-07T12:00:00")
        let important = priorityScore(
            StubTask(urgency: 1, importance: 4, dueAt: nil, deferUntil: nil), now: now)
        let urgent = priorityScore(
            StubTask(urgency: 4, importance: 1, dueAt: nil, deferUntil: nil), now: now)
        XCTAssertGreaterThan(important, urgent)
    }

    func testOverdueBoost() {
        let now = date("2026-07-07T12:00:00")
        let base = StubTask(urgency: 2, importance: 2, dueAt: nil, deferUntil: nil)
        var overdue = base; overdue.dueAt = date("2026-07-01T12:00:00")
        var nextWeek = base; nextWeek.dueAt = date("2026-07-20T12:00:00")
        XCTAssertGreaterThan(priorityScore(overdue, now: now), priorityScore(nextWeek, now: now))
    }
}

final class RecurrenceTests: XCTestCase {
    // 2026-07-07 is a Tuesday.
    let anchor = date("2026-07-07T09:00:00")

    func testParseFormatRoundTrip() {
        let rule = parseRule("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE")
        XCTAssertEqual(rule, RecurrenceRule(freq: .weekly, interval: 2, byday: [0, 2]))
        XCTAssertEqual(formatRule(rule!), "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE")
        XCTAssertNil(parseRule("FREQ=HOURLY"))
    }

    func testDaily() {
        XCTAssertEqual(
            nextOccurrence(rule: "FREQ=DAILY;INTERVAL=1", anchor: anchor),
            date("2026-07-08T09:00:00"))
        XCTAssertEqual(
            nextOccurrence(rule: "FREQ=DAILY;INTERVAL=3", anchor: anchor),
            date("2026-07-10T09:00:00"))
    }

    func testWeekly() {
        XCTAssertEqual(
            nextOccurrence(rule: "FREQ=WEEKLY;INTERVAL=1", anchor: anchor),
            date("2026-07-14T09:00:00"))
        // From Tuesday, MO,FR -> Friday the 10th
        XCTAssertEqual(
            nextOccurrence(rule: "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,FR", anchor: anchor),
            date("2026-07-10T09:00:00"))
        // Biweekly stays in the anchor week's phase
        XCTAssertEqual(
            nextOccurrence(rule: "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO", anchor: anchor),
            date("2026-07-20T09:00:00"))
    }

    func testMonthly() {
        XCTAssertEqual(
            nextOccurrence(rule: "FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=15", anchor: anchor),
            date("2026-07-15T09:00:00"))
        // Jan 31 clamps to Feb 28
        XCTAssertEqual(
            nextOccurrence(rule: "FREQ=MONTHLY;INTERVAL=1", anchor: date("2026-01-31T10:00:00")),
            date("2026-02-28T10:00:00"))
    }

    func testLateCompletionCatchesUp() {
        XCTAssertEqual(
            nextOccurrence(
                rule: "FREQ=WEEKLY;INTERVAL=1",
                anchor: anchor,
                after: date("2026-07-20T15:00:00")),
            date("2026-07-21T09:00:00"))
    }

    func testDescribe() {
        XCTAssertEqual(describeRule("FREQ=DAILY;INTERVAL=1"), "every day")
        XCTAssertEqual(
            describeRule("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE"),
            "every 2 weeks on Mon, Wed")
    }
}
