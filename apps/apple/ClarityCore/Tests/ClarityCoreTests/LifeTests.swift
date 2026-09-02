import Foundation
import Testing
@testable import ClarityCore

// Port of packages/shared/test/life.test.ts — the expected values must stay
// identical across the two suites.

private let horizon = LifeHorizonInput(birthDate: "1988-07-20", lifeExpectancy: 85)
private let now = date("2026-09-02T12:00:00") // age 38

private func experience(
    id: UUID = UUID(),
    status: ExperienceStatus = .planned,
    startAge: Int? = nil,
    endAge: Int? = nil,
    sortOrder: Double = 0,
    createdAt: Date = date("2026-01-01T00:00:00")
) -> LifeExperience {
    LifeExperience(
        id: id, userId: UUID(), title: "Sail the Aegean", category: .travel,
        status: status, targetAgeStart: startAge, targetAgeEnd: endAge,
        sortOrder: sortOrder, createdAt: createdAt)
}

@Suite struct LifeAgeTests {
    @Test func countsWholeYearsLived() {
        #expect(ageOn(birthDate: "1988-07-20", on: now) == 38)
    }

    @Test func doesNotCountABirthdayStillToCome() {
        #expect(ageOn(birthDate: "1988-12-31", on: now) == 37)
        #expect(ageOn(birthDate: "1988-09-02", on: now) == 38) // on the day
        #expect(ageOn(birthDate: "1988-09-03", on: now) == 37)
    }

    @Test func clampsBeforeBirthAndToleratesAMalformedDate() {
        #expect(ageOn(birthDate: "2030-01-01", on: now) == 0)
        #expect(ageOn(birthDate: "not-a-date", on: now) == 0)
    }

    @Test func mapsAnAgeOntoItsCalendarYear() {
        #expect(yearAtAge(birthDate: "1988-07-20", age: 0) == 1988)
        #expect(yearAtAge(birthDate: "1988-07-20", age: 40) == 2028)
    }
}

@Suite struct LifeProgressTests {
    @Test func reportsAgeYearsLeftAndShareLived() {
        let progress = lifeProgress(horizon, now: now)
        #expect(progress.age == 38)
        #expect(progress.yearsLeft == 47)
        #expect(progress.percentLived == 45)
        #expect(progress.currentYear == 2026)
    }

    @Test func neverReportsNegativeTimeLeftPastTheHorizon() {
        let old = LifeHorizonInput(birthDate: "1900-01-01", lifeExpectancy: 85)
        let progress = lifeProgress(old, now: now)
        #expect(progress.yearsLeft == 0)
        #expect(progress.percentLived == 100)
    }
}

@Suite struct LifeChapterTests {
    let chapters = lifeChapters(horizon, now: now)

    @Test func coversEveryDecadeToTheHorizonPlusAnOpenEndedTail() {
        #expect(
            chapters.map(\.key) == ["0", "10", "20", "30", "40", "50", "60", "70", "80", "beyond"]
        )
        let beyond = chapters.last!
        #expect(beyond.label == "Beyond 90")
        #expect(beyond.endAge == nil)
        #expect(beyond.endYear == nil)
    }

    @Test func marksOneCurrentChapterAndEverythingBeforeItAsPast() {
        #expect(chapters.filter(\.isCurrent).map(\.key) == ["30"])
        #expect(chapters.filter(\.isPast).map(\.key) == ["0", "10", "20"])
    }

    @Test func datesEachChapterAndTracksProgressThroughTheCurrentOne() {
        let thirties = chapters.first { $0.key == "30" }!
        #expect(thirties.label == "Your 30s")
        #expect(thirties.startYear == 2018)
        #expect(thirties.endYear == 2027)
        #expect(thirties.progress == 0.8)
        #expect(chapters.first { $0.key == "40" }!.progress == nil)
    }

    @Test func namesTheEarlyChaptersInPlainWords() {
        #expect(chapters[0].label == "Childhood")
        #expect(chapters[1].label == "Your teens")
    }

    @Test func bucketsAnAgeIntoItsDecadeAndPastTheHorizonIntoTheTail() {
        #expect(chapterKey(forAge: 38, horizon: horizon) == "30")
        #expect(chapterKey(forAge: 40, horizon: horizon) == "40")
        #expect(chapterKey(forAge: 89, horizon: horizon) == "80")
        #expect(chapterKey(forAge: 95, horizon: horizon) == "beyond")
    }
}

@Suite struct ExperienceWindowTests {
    @Test func returnsNilWhileTheExperienceIsUnplaced() {
        #expect(experienceWindow(experience(), horizon: horizon, now: now) == nil)
    }

    @Test func labelsASingleAgeWindowInAgesAndYears() {
        let window = experienceWindow(
            experience(startAge: 45, endAge: 45), horizon: horizon, now: now)!
        #expect(window.label == "age 45 · 2033")
        #expect(!window.closingSoon)
        #expect(!window.missed)
    }

    @Test func labelsARangeAndFillsInAHalfOpenOne() {
        #expect(
            experienceWindow(
                experience(startAge: 40, endAge: 45), horizon: horizon, now: now)!.label
                == "age 40–45 · 2028–2033")
        #expect(
            experienceWindow(experience(endAge: 50), horizon: horizon, now: now)!.label
                == "age 50 · 2038")
    }

    @Test func flagsAWindowClosingWithinTwoYears() {
        #expect(
            experienceWindow(experience(endAge: 40), horizon: horizon, now: now)!.closingSoon)
        #expect(
            !experienceWindow(experience(endAge: 41), horizon: horizon, now: now)!.closingSoon)
    }

    @Test func flagsAWindowThatClosedOnSomethingThatNeverHappened() {
        let window = experienceWindow(
            experience(startAge: 30, endAge: 35), horizon: horizon, now: now)!
        #expect(window.missed)
    }

    @Test func keepsLivedAndReleasedOutOfTheUrgencyFlags() {
        for status in [ExperienceStatus.lived, .released] {
            let window = experienceWindow(
                experience(status: status, startAge: 30, endAge: 35),
                horizon: horizon, now: now)!
            #expect(!window.missed)
            #expect(!window.closingSoon)
        }
    }

    @Test func ordersByWindowStartThenManualOrderThenAgeOfTheRow() {
        let a = UUID(), b = UUID(), c = UUID()
        let early = experience(id: a, startAge: 40)
        let late = experience(id: b, startAge: 45)
        let unplaced = experience(id: c)
        #expect(
            [late, unplaced, early].sorted(by: experienceIsOrderedBefore).map(\.id) == [a, b, c])

        let first = experience(id: a, startAge: 40, sortOrder: 1)
        let second = experience(id: b, startAge: 40, sortOrder: 2)
        #expect([second, first].sorted(by: experienceIsOrderedBefore).map(\.id) == [a, b])
    }
}
