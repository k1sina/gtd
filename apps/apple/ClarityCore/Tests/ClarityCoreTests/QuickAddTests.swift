import Foundation
import Testing
@testable import ClarityCore

// Mirrors packages/shared/test/nlparse.test.ts — the expected values must
// stay identical across both implementations.

@Suite struct QuickAddTests {
    // 2026-07-07 is a Tuesday.
    let now = date("2026-07-07T10:00:00")

    @Test func plainTextPassesThrough() {
        let p = parseQuickAdd("Buy milk", now: now)
        #expect(p.title == "Buy milk")
        #expect(p.dueAt == nil)
        #expect(p.tags == [])
    }

    @Test func kitchenSinkExample() {
        let p = parseQuickAdd(
            "Call mom tomorrow at 3pm @phone #Family !urgent ~15m",
            now: now
        )
        #expect(p.title == "Call mom")
        #expect(p.dueAt == date("2026-07-08T15:00:00"))
        #expect(p.tags == ["phone"])
        #expect(p.projectHint == "Family")
        #expect(p.urgency == 4)
        #expect(p.estimatedMinutes == 15)
    }

    @Test func weekdaysAndNextWeekday() {
        #expect(
            parseQuickAdd("Review report friday", now: now).dueAt
                == date("2026-07-10T17:00:00"))
        // "tuesday" on a Tuesday = next week's Tuesday
        #expect(
            parseQuickAdd("Standup tuesday", now: now).dueAt
                == date("2026-07-14T17:00:00"))
        #expect(
            parseQuickAdd("Plan trip next monday", now: now).dueAt
                == date("2026-07-13T17:00:00"))
    }

    @Test func relativeOffsets() {
        #expect(
            parseQuickAdd("Renew passport in 3 weeks", now: now).dueAt
                == date("2026-07-28T17:00:00"))
        #expect(
            parseQuickAdd("Dentist in 2 days", now: now).dueAt
                == date("2026-07-09T17:00:00"))
    }

    @Test func timeWithoutDateLandsOnNextSuchTime() {
        #expect(
            parseQuickAdd("Gym at 7am", now: now).dueAt
                == date("2026-07-08T07:00:00")) // 7am already passed today
        #expect(
            parseQuickAdd("Call bank at 4pm", now: now).dueAt
                == date("2026-07-07T16:00:00"))
    }

    @Test func recurrencePhrases() {
        #expect(
            parseQuickAdd("Water plants every 3 days", now: now).recurrenceRule
                == "FREQ=DAILY;INTERVAL=3")
        #expect(
            parseQuickAdd("Team sync every monday", now: now).recurrenceRule
                == "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO")
        #expect(
            parseQuickAdd("Pay rent every month", now: now).recurrenceRule
                == "FREQ=MONTHLY;INTERVAL=1")
        #expect(
            parseQuickAdd("Journal every weekday", now: now).recurrenceRule
                == "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR")
    }

    @Test func estimatesWithHoursAndMinutes() {
        #expect(parseQuickAdd("Write essay ~2h", now: now).estimatedMinutes == 120)
        #expect(parseQuickAdd("Deep work ~1h30m", now: now).estimatedMinutes == 90)
        #expect(parseQuickAdd("Email ~10m", now: now).estimatedMinutes == 10)
    }

    @Test func multipleTagsAndSomeday() {
        let p = parseQuickAdd("Learn piano @home @music !someday", now: now)
        #expect(p.tags == ["home", "music"])
        #expect(p.someday == true)
        #expect(p.title == "Learn piano")
    }

    @Test func keepsEmailsAndMidWordSymbolsIntact() {
        let p = parseQuickAdd("Email keivan.sina@gmail.com about trip", now: now)
        #expect(p.title == "Email keivan.sina@gmail.com about trip")
        #expect(p.tags == [])
    }
}
