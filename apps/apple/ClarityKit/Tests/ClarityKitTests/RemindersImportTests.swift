import ClarityCore
import Foundation
import XCTest

@testable import ClarityKit

final class RemindersImportTests: XCTestCase {
    private let spaceId = UUID()
    private let userId = UUID()

    private func reminder(
        id: String = "R1", list: String, section: String? = nil,
        title: String = "Do the thing", notes: String? = nil, priority: Int = 0,
        due: Date? = nil, allDay: Bool = false, completed: Bool = false,
        completionDate: Date? = nil, parent: String? = nil, tags: [String] = [],
        recurrence: ImportedRecurrence? = nil
    ) -> ImportedReminder {
        ImportedReminder(
            externalId: id, listName: list, sectionName: section, title: title,
            notes: notes, priority: priority, dueDate: due, dueIsAllDay: allDay,
            isCompleted: completed, completionDate: completionDate,
            parentExternalId: parent, tags: tags, recurrence: recurrence)
    }

    // MARK: status mapping

    func testStatusForGTDLists() {
        XCTAssertEqual(RemindersImport.status(forList: "Inbox"), .inbox)
        XCTAssertEqual(RemindersImport.status(forList: "Soon"), .next)
        XCTAssertEqual(RemindersImport.status(forList: "Waiting"), .waiting)
        XCTAssertEqual(RemindersImport.status(forList: "Someday"), .someday)
        XCTAssertEqual(RemindersImport.status(forList: " someday "), .someday)
    }

    func testStatusForProjectListsIsNext() {
        XCTAssertEqual(RemindersImport.status(forList: "Budget"), .next)
        XCTAssertEqual(RemindersImport.status(forList: "Active Projects"), .next)
    }

    // MARK: project mapping

    func testSectionsBecomeProjects() {
        XCTAssertEqual(
            RemindersImport.projectName(listName: "Active Projects", sectionName: "JAKOTA"),
            "JAKOTA")
        XCTAssertEqual(
            RemindersImport.projectName(listName: "Someday", sectionName: "Travel"),
            "Travel")
    }

    func testStatusListsWithoutSectionHaveNoProject() {
        XCTAssertNil(RemindersImport.projectName(listName: "Inbox", sectionName: nil))
        XCTAssertNil(RemindersImport.projectName(listName: "Someday", sectionName: nil))
        XCTAssertNil(RemindersImport.projectName(listName: "Waiting", sectionName: ""))
    }

    func testOtherListsBecomeProjects() {
        XCTAssertEqual(
            RemindersImport.projectName(listName: "Budget", sectionName: nil), "Budget")
    }

    // MARK: priority

    func testEKPriorityToUrgency() {
        XCTAssertEqual(RemindersImport.urgency(forPriority: 0), 2)
        XCTAssertEqual(RemindersImport.urgency(forPriority: 1), 4)
        XCTAssertEqual(RemindersImport.urgency(forPriority: 5), 3)
        XCTAssertEqual(RemindersImport.urgency(forPriority: 9), 2)
    }

    // MARK: recurrence down-mapping

    func testWeeklyRecurrenceMapsToByday() {
        let rule = RemindersImport.recurrenceRule(
            for: ImportedRecurrence(frequency: .weekly, interval: 2, isoWeekdays: [0, 4]))
        XCTAssertEqual(rule, "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,FR")
    }

    func testMonthlyRecurrenceMapsToByMonthday() {
        let rule = RemindersImport.recurrenceRule(
            for: ImportedRecurrence(frequency: .monthly, interval: 1, dayOfMonth: 15))
        XCTAssertEqual(rule, "FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=15")
    }

    func testUnsupportedRecurrenceIsDropped() {
        XCTAssertNil(
            RemindersImport.recurrenceRule(
                for: ImportedRecurrence(
                    frequency: .weekly, interval: 1, hasUnsupportedClauses: true)))
        XCTAssertNil(RemindersImport.recurrenceRule(for: nil))
    }

    func testRoundTripThroughParser() {
        let formatted = RemindersImport.recurrenceRule(
            for: ImportedRecurrence(frequency: .daily, interval: 3))
        XCTAssertEqual(parseRule(formatted!), RecurrenceRule(freq: .daily, interval: 3))
    }

    // MARK: due dates

    func testAllDayDueMovesToEndOfDay() {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Europe/Berlin")!
        let startOfDay = DateComponents(
            calendar: calendar, year: 2026, month: 7, day: 10
        ).date!
        let due = RemindersImport.dueAt(
            for: reminder(list: "Soon", due: startOfDay, allDay: true),
            calendar: calendar)
        let comps = calendar.dateComponents([.year, .month, .day, .hour, .minute], from: due!)
        XCTAssertEqual([comps.year, comps.month, comps.day], [2026, 7, 10])
        XCTAssertEqual([comps.hour, comps.minute], [23, 59])
    }

    func testTimedDuePassesThrough() {
        let date = Date(timeIntervalSince1970: 1_780_000_000)
        XCTAssertEqual(
            RemindersImport.dueAt(for: reminder(list: "Soon", due: date)), date)
    }

    // MARK: payload assembly

    func testPayloadForOpenReminder() {
        let jakota = UUID()
        let payload = RemindersImport.payload(
            for: reminder(
                id: "ABC", list: "Active Projects", section: "JAKOTA",
                title: "  Log my times  ", notes: "  ", tags: ["desk", "m"]),
            spaceId: spaceId, userId: userId, projectIds: ["jakota": jakota])
        XCTAssertEqual(payload.title, "Log my times")
        XCTAssertNil(payload.notes)
        XCTAssertEqual(payload.status, .next)
        XCTAssertEqual(payload.projectId, jakota)
        XCTAssertEqual(payload.contextTags, ["desk", "m"])
        XCTAssertEqual(payload.externalRef, "apple-reminders:ABC")
        XCTAssertNil(payload.completedAt)
    }

    func testPayloadForCompletedReminderOverridesStatus() {
        let done = Date(timeIntervalSince1970: 1_770_000_000)
        let payload = RemindersImport.payload(
            for: reminder(
                list: "Soon", completed: true, completionDate: done,
                recurrence: ImportedRecurrence(frequency: .daily)),
            spaceId: spaceId, userId: userId, projectIds: [:])
        XCTAssertEqual(payload.status, .done)
        XCTAssertEqual(payload.completedAt, done)
        // Completed reminders must not respawn via the recurrence engine.
        XCTAssertNil(payload.recurrenceRule)
    }

    func testPayloadEmptyTitleFallsBack() {
        let payload = RemindersImport.payload(
            for: reminder(list: "Inbox", title: "   "),
            spaceId: spaceId, userId: userId, projectIds: [:])
        XCTAssertEqual(payload.title, "Untitled")
    }

    // MARK: project discovery

    func testMissingProjectNamesDedupesCaseInsensitively() {
        let existing = [
            Project(id: UUID(), spaceId: spaceId, name: "jakota")
        ]
        let missing = RemindersImport.missingProjectNames(
            for: [
                reminder(id: "1", list: "Active Projects", section: "JAKOTA"),
                reminder(id: "2", list: "Budget"),
                reminder(id: "3", list: "Budget"),
                reminder(id: "4", list: "Someday", section: "Travel"),
                reminder(id: "5", list: "Inbox"),
            ],
            existing: existing)
        XCTAssertEqual(missing, ["Budget", "Travel"])
    }

    // MARK: batch encoding invariant

    func testPayloadRowsEncodeUniformKeys() throws {
        let full = RemindersImport.payload(
            for: reminder(
                list: "Soon", notes: "n", due: Date(), tags: ["desk"],
                recurrence: ImportedRecurrence(frequency: .daily)),
            spaceId: spaceId, userId: userId, projectIds: [:])
        let sparse = RemindersImport.payload(
            for: reminder(list: "Inbox"),
            spaceId: spaceId, userId: userId, projectIds: [:])

        func keys(_ p: NewTaskPayload) throws -> Set<String> {
            let data = try PostgrestJSON.encoder.encode(p)
            let object = try XCTUnwrap(
                JSONSerialization.jsonObject(with: data) as? [String: Any])
            return Set(object.keys)
        }
        XCTAssertEqual(try keys(full), try keys(sparse))
        XCTAssertTrue(try keys(sparse).contains("external_ref"))
        XCTAssertTrue(try keys(sparse).contains("sort_order"))
    }
}
