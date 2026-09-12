import Foundation

// Lifetime map: turning a birth date and a chosen life expectancy into the
// chapters an experience can be placed into, and reading an experience's age
// window back out as ages and calendar years.
//
// Mirrors packages/shared/src/life.ts — keep the two and their test suites in
// sync. A birth date is a civil date (a day on the calendar), so everything
// here is calendar arithmetic, never elapsed-time arithmetic.

/// Chapters are decades of age; the current decade is where "you are here".
public let chapterSpan = 10

public struct LifeHorizonInput: Hashable, Sendable {
    /// "yyyy-MM-dd"
    public let birthDate: String
    /// The horizon planned against, e.g. 85.
    public let lifeExpectancy: Int

    public init(birthDate: String, lifeExpectancy: Int) {
        self.birthDate = birthDate
        self.lifeExpectancy = lifeExpectancy
    }
}

public struct LifeChapter: Hashable, Identifiable, Sendable {
    /// Stable key, e.g. "30" for the thirties, "beyond" for the tail.
    public let key: String
    /// e.g. "Your 30s" or "Beyond 85".
    public let label: String
    public let startAge: Int
    /// Inclusive; nil only for the open-ended chapter past life expectancy.
    public let endAge: Int?
    public let startYear: Int
    public let endYear: Int?
    public let isPast: Bool
    public let isCurrent: Bool
    /// 0...1 through the chapter; only set for the current one.
    public let progress: Double?

    public var id: String { key }
}

public struct LifeProgress: Hashable, Sendable {
    public let age: Int
    public let yearsLeft: Int
    /// 0...100, how much of the planned horizon is behind you.
    public let percentLived: Int
    public let currentYear: Int
}

private struct CivilDate {
    let year: Int
    let month: Int
    let day: Int
}

private func parseDateKey(_ key: String) -> CivilDate? {
    let parts = key.split(separator: "-", omittingEmptySubsequences: false)
    guard parts.count == 3,
          parts[0].count == 4, parts[1].count == 2, parts[2].count == 2,
          let y = Int(parts[0]), let m = Int(parts[1]), let d = Int(parts[2])
    else { return nil }
    return CivilDate(year: y, month: m, day: d)
}

/// Whole years lived on `date`. Negative before birth is clamped to 0.
public func ageOn(birthDate: String, on date: Date, calendar: Calendar = .current) -> Int {
    guard let birth = parseDateKey(birthDate) else { return 0 }
    let c = calendar.dateComponents([.year, .month, .day], from: date)
    guard let year = c.year, let month = c.month, let day = c.day else { return 0 }
    var age = year - birth.year
    if month < birth.month || (month == birth.month && day < birth.day) {
        age -= 1
    }
    return max(0, age)
}

/// The calendar year in which the user turns `age`.
public func yearAtAge(birthDate: String, age: Int, calendar: Calendar = .current) -> Int {
    let birthYear = parseDateKey(birthDate)?.year
        ?? calendar.component(.year, from: Date())
    return birthYear + age
}

public func lifeProgress(
    _ horizon: LifeHorizonInput, now: Date = Date(), calendar: Calendar = .current
) -> LifeProgress {
    let age = ageOn(birthDate: horizon.birthDate, on: now, calendar: calendar)
    return LifeProgress(
        age: age,
        yearsLeft: max(0, horizon.lifeExpectancy - age),
        percentLived: min(
            100,
            Int((Double(age) / Double(max(1, horizon.lifeExpectancy)) * 100).rounded())),
        currentYear: calendar.component(.year, from: now)
    )
}

private func chapterLabel(startAge: Int) -> String {
    switch startAge {
    case 0: return "Childhood"
    case 10: return "Your teens"
    default: return "Your \(startAge)s"
    }
}

/// Every decade of life from birth to the chosen horizon, plus one open-ended
/// chapter beyond it — planning past your own expectancy is allowed, and the
/// chapter being there says so.
public func lifeChapters(
    _ horizon: LifeHorizonInput, now: Date = Date(), calendar: Calendar = .current
) -> [LifeChapter] {
    let age = ageOn(birthDate: horizon.birthDate, on: now, calendar: calendar)
    let last = horizon.lifeExpectancy / chapterSpan * chapterSpan
    var chapters: [LifeChapter] = []

    for startAge in stride(from: 0, through: last, by: chapterSpan) {
        let endAge = startAge + chapterSpan - 1
        let isCurrent = age >= startAge && age <= endAge
        chapters.append(
            LifeChapter(
                key: String(startAge),
                label: chapterLabel(startAge: startAge),
                startAge: startAge,
                endAge: endAge,
                startYear: yearAtAge(
                    birthDate: horizon.birthDate, age: startAge, calendar: calendar),
                endYear: yearAtAge(
                    birthDate: horizon.birthDate, age: endAge, calendar: calendar),
                isPast: endAge < age,
                isCurrent: isCurrent,
                progress: isCurrent ? Double(age - startAge) / Double(chapterSpan) : nil
            ))
    }

    let beyondStart = last + chapterSpan
    chapters.append(
        LifeChapter(
            key: "beyond",
            label: "Beyond \(beyondStart)",
            startAge: beyondStart,
            endAge: nil,
            startYear: yearAtAge(
                birthDate: horizon.birthDate, age: beyondStart, calendar: calendar),
            endYear: nil,
            isPast: false,
            isCurrent: age >= beyondStart,
            progress: nil
        ))

    return chapters
}

/// The chapter an age window belongs to — keyed off where the window opens.
public func chapterKey(forAge age: Int, horizon: LifeHorizonInput) -> String {
    let last = horizon.lifeExpectancy / chapterSpan * chapterSpan
    let start = age / chapterSpan * chapterSpan
    return start > last ? "beyond" : String(start)
}

public struct ExperienceWindow: Hashable, Sendable {
    public let startAge: Int
    public let endAge: Int
    public let startYear: Int
    public let endYear: Int
    /// "age 40–45 · 2028–2033"
    public let label: String
    /// Ends within the next two years, and not lived yet.
    public let closingSoon: Bool
    /// The window is behind you and the experience never happened.
    public let missed: Bool
}

/// Reads an experience's window in both scales people actually think in: how
/// old they'll be, and which years those are. Returns nil while the
/// experience is an unplaced dream.
public func experienceWindow(
    _ experience: LifeExperience, horizon: LifeHorizonInput, now: Date = Date(),
    calendar: Calendar = .current
) -> ExperienceWindow? {
    guard let startAge = experience.targetAgeStart ?? experience.targetAgeEnd else {
        return nil
    }
    let endAge = experience.targetAgeEnd ?? startAge
    let startYear = yearAtAge(
        birthDate: horizon.birthDate, age: startAge, calendar: calendar)
    let endYear = yearAtAge(birthDate: horizon.birthDate, age: endAge, calendar: calendar)
    let age = ageOn(birthDate: horizon.birthDate, on: now, calendar: calendar)
    let open = experience.status != .lived && experience.status != .released

    let label =
        startAge == endAge
        ? "age \(startAge) · \(startYear)"
        : "age \(startAge)–\(endAge) · \(startYear)–\(endYear)"

    return ExperienceWindow(
        startAge: startAge,
        endAge: endAge,
        startYear: startYear,
        endYear: endYear,
        label: label,
        closingSoon: open && endAge >= age && endAge - age <= 2,
        missed: open && endAge < age
    )
}

/// Sort for a chapter's cards: earliest window first, then by manual order.
public func experienceIsOrderedBefore(_ a: LifeExperience, _ b: LifeExperience) -> Bool {
    let aStart = a.targetAgeStart ?? a.targetAgeEnd ?? Int.max
    let bStart = b.targetAgeStart ?? b.targetAgeEnd ?? Int.max
    if aStart != bStart { return aStart < bStart }
    if a.sortOrder != b.sortOrder { return a.sortOrder < b.sortOrder }
    return a.createdAt < b.createdAt
}
