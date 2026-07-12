import Foundation
import Testing
@testable import ClarityCore

// Mirrors the behavior of apps/web/src/lib/format.ts and the streak logic in
// the web habits/review pages. 2026-07-07 is a Tuesday.

@Suite struct PeriodTests {
    @Test func weekPeriodIsMondayToSunday() {
        let period = weekPeriod(for: date("2026-07-07T10:00:00"))
        #expect(period.start == "2026-07-06")
        #expect(period.end == "2026-07-12")
        // A Monday maps onto its own week; Sunday still belongs to it.
        #expect(weekPeriod(for: date("2026-07-06T00:30:00")).start == "2026-07-06")
        #expect(weekPeriod(for: date("2026-07-12T23:00:00")).start == "2026-07-06")
    }

    @Test func weekPeriodCrossesYearBoundary() {
        // 2027-01-01 is a Friday; its week starts Monday 2026-12-28.
        let period = weekPeriod(for: date("2027-01-01T12:00:00"))
        #expect(period.start == "2026-12-28")
        #expect(period.end == "2027-01-03")
    }

    @Test func quarterOfDate() {
        #expect(quarterOf(date("2026-07-07T10:00:00")) == (2026, 3))
        #expect(quarterOf(date("2026-01-01T00:00:00")) == (2026, 1))
        #expect(quarterOf(date("2026-12-31T23:59:00")) == (2026, 4))
    }

    @Test func quarterPeriodBounds() {
        let q3 = quarterPeriod(year: 2026, quarter: 3)
        #expect(q3.start == "2026-07-01")
        #expect(q3.end == "2026-09-30")
        let q1 = quarterPeriod(year: 2026, quarter: 1)
        #expect(q1.start == "2026-01-01")
        #expect(q1.end == "2026-03-31")
        let q4 = quarterPeriod(year: 2026, quarter: 4)
        #expect(q4.end == "2026-12-31")
    }

    @Test func dateKeyPadsComponents() {
        #expect(Dates.dateKey(date("2026-01-05T09:00:00")) == "2026-01-05")
    }
}

@Suite struct StreakTests {
    private func habit(weekdays: [Int]) -> Habit {
        Habit(id: UUID(), spaceId: UUID(), createdBy: UUID(), name: "Stretch", weekdays: weekdays)
    }

    @Test func missedTodayDoesNotBreakStreak() {
        // Daily habit, logged yesterday and the day before, not yet today.
        let today = date("2026-07-07T10:00:00")
        let logs: Set<String> = ["2026-07-06", "2026-07-05"]
        #expect(habitStreak(habit: habit(weekdays: []), logDates: logs, today: today) == 2)
    }

    @Test func todayLoggedExtendsStreak() {
        let today = date("2026-07-07T10:00:00")
        let logs: Set<String> = ["2026-07-07", "2026-07-06"]
        #expect(habitStreak(habit: habit(weekdays: []), logDates: logs, today: today) == 2)
    }

    @Test func nonDueDaysAreSkipped() {
        // Mon/Wed/Fri habit (0, 2, 4). Today is Tuesday 2026-07-07 (not due).
        // Logged Mon 07-06 and Fri 07-03; Tue/Thu/weekend gaps don't break it.
        let today = date("2026-07-07T10:00:00")
        let logs: Set<String> = ["2026-07-06", "2026-07-03", "2026-07-01"]
        #expect(habitStreak(habit: habit(weekdays: [0, 2, 4]), logDates: logs, today: today) == 3)
    }

    @Test func gapBreaksStreak() {
        let today = date("2026-07-07T10:00:00")
        let logs: Set<String> = ["2026-07-06", "2026-07-04"] // missed 07-05
        #expect(habitStreak(habit: habit(weekdays: []), logDates: logs, today: today) == 1)
    }

    @Test func weeklyReviewStreakCountsBackToBack() {
        let now = date("2026-07-07T10:00:00") // week of 07-06
        // This week not done yet; previous two weeks done.
        let periods: Set<String> = ["2026-06-29", "2026-06-22"]
        #expect(weeklyReviewStreak(completedPeriodStarts: periods, now: now) == 2)
        // Done this week too.
        let withThisWeek = periods.union(["2026-07-06"])
        #expect(weeklyReviewStreak(completedPeriodStarts: withThisWeek, now: now) == 3)
        // A gap ends the streak.
        let gapped: Set<String> = ["2026-07-06", "2026-06-22"]
        #expect(weeklyReviewStreak(completedPeriodStarts: gapped, now: now) == 1)
    }
}

@Suite struct ScheduledBucketTests {
    let now = date("2026-07-07T10:00:00")

    @Test func bucketsMirrorWebGrouping() {
        #expect(scheduledBucket(for: date("2026-07-06T23:00:00"), now: now) == .overdue)
        #expect(scheduledBucket(for: date("2026-07-07T00:00:00"), now: now) == .today)
        #expect(scheduledBucket(for: date("2026-07-07T23:59:00"), now: now) == .today)
        #expect(scheduledBucket(for: date("2026-07-08T00:00:00"), now: now) == .week)
        #expect(scheduledBucket(for: date("2026-07-13T23:59:00"), now: now) == .week)
        #expect(scheduledBucket(for: date("2026-07-14T00:00:00"), now: now) == .later)
    }
}

@Suite struct QuadrantValueTests {
    @Test func representativeValuesMirrorWebMatrix() {
        #expect(Quadrant.doFirst.representativeValues == (4, 4))
        #expect(Quadrant.schedule.representativeValues == (2, 4))
        #expect(Quadrant.delegate.representativeValues == (4, 2))
        // (1, 1), not (2, 2) — that's the "unrated" sentinel.
        #expect(Quadrant.eliminate.representativeValues == (1, 1))
        // Round-trip: dropping into a quadrant must land in that quadrant.
        for q: Quadrant in [.doFirst, .schedule, .delegate, .eliminate] {
            let v = q.representativeValues
            #expect(quadrant(urgency: v.urgency, importance: v.importance) == q)
        }
    }
}

@Suite struct ChatBlockTests {
    @Test func decodesKnownAndUnknownBlocks() throws {
        let json = """
            [
              {"type": "thinking", "thinking": "hmm", "signature": "x"},
              {"type": "text", "text": "Hello"},
              {"type": "tool_use", "id": "t1", "name": "create_task", "input": {"title": "x"}},
              {"type": "tool_result", "tool_use_id": "t1", "content": "{}"},
              {"type": "brand_new_block", "payload": {"a": 1}}
            ]
            """.data(using: .utf8)!
        let blocks = try JSONDecoder().decode([ChatBlock].self, from: json)
        #expect(blocks.count == 5)
        #expect(blocks[0] == .unknown(type: "thinking"))
        #expect(blocks[1] == .text("Hello"))
        #expect(blocks[2] == .toolUse(name: "create_task"))
        #expect(blocks[3] == .toolResult)
        #expect(blocks[4] == .unknown(type: "brand_new_block"))
    }

    @Test func messageTextAndToolNames() {
        let message = ChatMessage(
            id: UUID(), sessionId: UUID(), role: "assistant",
            content: [
                .unknown(type: "thinking"),
                .text("First"),
                .toolUse(name: "list_tasks"),
                .text("Second"),
            ])
        #expect(message.text == "First\n\nSecond")
        #expect(message.toolNames == ["list_tasks"])
    }
}
