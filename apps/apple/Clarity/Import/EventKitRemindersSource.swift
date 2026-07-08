import ClarityKit
import EventKit
import Foundation

/// One Reminders list, for the selection UI.
struct ReminderListInfo: Identifiable, Hashable {
    let id: String  // EKCalendar.calendarIdentifier
    let title: String
    var openCount = 0
    var completedCount = 0
}

/// Thin EventKit adapter: requests Reminders access and snapshots EKReminders
/// into the platform-neutral ImportedReminder the importer consumes.
///
/// EventKit's public API exposes neither list sections, nor subtask
/// hierarchy, nor hashtags (all private to the Reminders app), so
/// `sectionName`, `parentExternalId`, and `tags` stay empty here — the
/// importer maps such reminders flat and the UI says so. `external_ref`
/// keeps the reminder identity, so richer sources can backfill later.
final class EventKitRemindersSource {
    enum AccessError: LocalizedError {
        case denied

        var errorDescription: String? {
            "Clarity has no access to your Reminders. Allow it under "
                + "Privacy & Security → Reminders, then try again."
        }
    }

    private let store = EKEventStore()

    func requestAccess() async throws {
        guard try await store.requestFullAccessToReminders() else {
            throw AccessError.denied
        }
    }

    /// All reminder lists with open/completed counts, sorted by title.
    func lists() async throws -> [ReminderListInfo] {
        let calendars = store.calendars(for: .reminder)
        var infos = Dictionary(
            calendars.map { ($0.calendarIdentifier, ReminderListInfo(
                id: $0.calendarIdentifier, title: $0.title)) },
            uniquingKeysWith: { first, _ in first })
        for reminder in await fetch(matching: store.predicateForReminders(in: calendars)) {
            guard let id = reminder.calendar?.calendarIdentifier else { continue }
            if reminder.isCompleted {
                infos[id]?.completedCount += 1
            } else {
                infos[id]?.openCount += 1
            }
        }
        return infos.values.sorted {
            $0.title.localizedCaseInsensitiveCompare($1.title) == .orderedAscending
        }
    }

    func reminders(
        inLists listIds: Set<String>, includeCompleted: Bool
    ) async -> [ImportedReminder] {
        let calendars = store.calendars(for: .reminder)
            .filter { listIds.contains($0.calendarIdentifier) }
        guard !calendars.isEmpty else { return [] }
        return await fetch(matching: store.predicateForReminders(in: calendars))
            .filter { includeCompleted || !$0.isCompleted }
            .map(snapshot)
    }

    private func fetch(matching predicate: NSPredicate) async -> [EKReminder] {
        await withCheckedContinuation { continuation in
            store.fetchReminders(matching: predicate) { reminders in
                continuation.resume(returning: reminders ?? [])
            }
        }
    }

    private func snapshot(_ reminder: EKReminder) -> ImportedReminder {
        var due: Date?
        var allDay = false
        if let components = reminder.dueDateComponents {
            due = components.calendar?.date(from: components)
                ?? Calendar.current.date(from: components)
            allDay = components.hour == nil
        }
        return ImportedReminder(
            externalId: reminder.calendarItemExternalIdentifier
                ?? reminder.calendarItemIdentifier,
            listName: reminder.calendar?.title ?? "Reminders",
            title: reminder.title ?? "",
            notes: reminder.notes,
            priority: reminder.priority,
            dueDate: due,
            dueIsAllDay: allDay,
            isCompleted: reminder.isCompleted,
            completionDate: reminder.completionDate,
            recurrence: snapshotRecurrence(reminder.recurrenceRules))
    }

    /// Snapshot the first EK recurrence rule; anything the RRULE subset can't
    /// express is flagged so the importer drops it instead of mistranslating.
    private func snapshotRecurrence(_ rules: [EKRecurrenceRule]?) -> ImportedRecurrence? {
        guard let rule = rules?.first else { return nil }

        let frequency: ImportedRecurrence.Frequency
        switch rule.frequency {
        case .daily: frequency = .daily
        case .weekly: frequency = .weekly
        case .monthly: frequency = .monthly
        case .yearly: frequency = .yearly
        @unknown default:
            return ImportedRecurrence(frequency: .daily, hasUnsupportedClauses: true)
        }

        var unsupported = (rules?.count ?? 0) > 1
            || rule.recurrenceEnd != nil
            || rule.monthsOfTheYear?.isEmpty == false
            || rule.weeksOfTheYear?.isEmpty == false
            || rule.daysOfTheYear?.isEmpty == false
            || rule.setPositions?.isEmpty == false

        // "3rd Tuesday"-style positional weekdays have no BYDAY equivalent in
        // the subset; plain weekdays (weekNumber 0) map to 0=Mon…6=Sun.
        var isoWeekdays: [Int]?
        if let days = rule.daysOfTheWeek, !days.isEmpty {
            if days.contains(where: { $0.weekNumber != 0 }) {
                unsupported = true
            } else {
                isoWeekdays = days.map { ($0.dayOfTheWeek.rawValue + 5) % 7 }.sorted()
            }
        }

        var dayOfMonth: Int?
        if let days = rule.daysOfTheMonth, !days.isEmpty {
            if days.count > 1 || days[0].intValue < 1 {
                unsupported = true  // multiple days or "last day" counting
            } else {
                dayOfMonth = days[0].intValue
            }
        }

        return ImportedRecurrence(
            frequency: frequency,
            interval: rule.interval,
            isoWeekdays: isoWeekdays,
            dayOfMonth: dayOfMonth,
            hasUnsupportedClauses: unsupported)
    }
}
