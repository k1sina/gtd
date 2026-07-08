import ClarityCore
import Foundation

// Apple Reminders → Clarity import.
//
// The mapping lives here, decoupled from EventKit, so it is unit-testable and
// the EventKit reader in the app target stays a thin adapter:
//   list Inbox → status inbox · Soon → next · Waiting → waiting ·
//   Someday → someday · any other list → next (its items are clarified).
//   Sections → projects; other lists themselves → projects. The four status
//   lists above never become projects.
//   Completed reminders → status done + completed_at.
//   Subtasks keep their hierarchy via parent_task_id.
//   Every task gets external_ref = "apple-reminders:<externalId>" so re-runs
//   skip what was already imported (unique index on space_id, external_ref).

/// Platform-neutral snapshot of one reminder, as handed over by the EventKit
/// adapter (or fixtures in tests).
public struct ImportedReminder: Sendable, Hashable {
    public var externalId: String
    public var listName: String
    public var sectionName: String?
    public var title: String
    public var notes: String?
    /// EventKit priority scale: 0 none, 1–4 high, 5 medium, 6–9 low.
    public var priority: Int
    public var dueDate: Date?
    /// All-day due dates arrive as start-of-day; the mapping moves them to
    /// 23:59 local so the task stays "due today" all day.
    public var dueIsAllDay: Bool
    public var isCompleted: Bool
    public var completionDate: Date?
    public var parentExternalId: String?
    public var tags: [String]
    public var recurrence: ImportedRecurrence?

    public init(
        externalId: String, listName: String, sectionName: String? = nil,
        title: String, notes: String? = nil, priority: Int = 0,
        dueDate: Date? = nil, dueIsAllDay: Bool = false,
        isCompleted: Bool = false, completionDate: Date? = nil,
        parentExternalId: String? = nil, tags: [String] = [],
        recurrence: ImportedRecurrence? = nil
    ) {
        self.externalId = externalId
        self.listName = listName
        self.sectionName = sectionName
        self.title = title
        self.notes = notes
        self.priority = priority
        self.dueDate = dueDate
        self.dueIsAllDay = dueIsAllDay
        self.isCompleted = isCompleted
        self.completionDate = completionDate
        self.parentExternalId = parentExternalId
        self.tags = tags
        self.recurrence = recurrence
    }
}

/// EventKit recurrence, snapshotted without EventKit types.
public struct ImportedRecurrence: Sendable, Hashable {
    public enum Frequency: Sendable { case daily, weekly, monthly, yearly }

    public var frequency: Frequency
    public var interval: Int
    /// 0 = Monday … 6 = Sunday (the ClarityCore convention).
    public var isoWeekdays: [Int]?
    public var dayOfMonth: Int?
    /// True when the EK rule carries clauses the RRULE subset can't express
    /// (end date, positional weekdays, BYMONTH, set positions…). Such rules
    /// are dropped rather than mistranslated.
    public var hasUnsupportedClauses: Bool

    public init(
        frequency: Frequency, interval: Int = 1, isoWeekdays: [Int]? = nil,
        dayOfMonth: Int? = nil, hasUnsupportedClauses: Bool = false
    ) {
        self.frequency = frequency
        self.interval = interval
        self.isoWeekdays = isoWeekdays
        self.dayOfMonth = dayOfMonth
        self.hasUnsupportedClauses = hasUnsupportedClauses
    }
}

public enum RemindersImport {
    public static let externalRefPrefix = "apple-reminders:"

    public static func externalRef(for externalId: String) -> String {
        externalRefPrefix + externalId
    }

    /// Lists whose names carry GTD meaning map straight onto statuses and do
    /// not become projects. Everything else holds clarified work → `next`.
    public static func status(forList listName: String) -> TaskStatus {
        switch listName.trimmingCharacters(in: .whitespaces).lowercased() {
        case "inbox": return .inbox
        case "soon", "next": return .next
        case "waiting", "waiting for": return .waiting
        case "someday", "someday/maybe": return .someday
        default: return .next
        }
    }

    private static func isStatusList(_ listName: String) -> Bool {
        switch listName.trimmingCharacters(in: .whitespaces).lowercased() {
        case "inbox", "soon", "next", "waiting", "waiting for", "someday", "someday/maybe":
            return true
        default:
            return false
        }
    }

    /// Sections always become projects; non-status lists become projects for
    /// their unsectioned reminders.
    public static func projectName(listName: String, sectionName: String?) -> String? {
        if let sectionName, !sectionName.trimmingCharacters(in: .whitespaces).isEmpty {
            return sectionName
        }
        return isStatusList(listName) ? nil : listName
    }

    /// EK priority (0 none, 1–4 high, 5 medium, 6–9 low) → urgency 1..4.
    public static func urgency(forPriority priority: Int) -> Int {
        switch priority {
        case 1...4: return 4
        case 5: return 3
        case 6...9: return 2
        default: return 2
        }
    }

    /// Down-map an EK recurrence onto the RRULE subset; nil when the rule
    /// can't be represented faithfully.
    public static func recurrenceRule(for recurrence: ImportedRecurrence?) -> String? {
        guard let recurrence, !recurrence.hasUnsupportedClauses else { return nil }
        let rule: RecurrenceRule
        switch recurrence.frequency {
        case .daily:
            rule = RecurrenceRule(freq: .daily, interval: recurrence.interval)
        case .weekly:
            rule = RecurrenceRule(
                freq: .weekly, interval: recurrence.interval,
                byday: recurrence.isoWeekdays?.isEmpty == false ? recurrence.isoWeekdays : nil)
        case .monthly:
            rule = RecurrenceRule(
                freq: .monthly, interval: recurrence.interval,
                bymonthday: recurrence.dayOfMonth)
        case .yearly:
            rule = RecurrenceRule(freq: .yearly, interval: recurrence.interval)
        }
        return formatRule(rule)
    }

    /// Due timestamp: timed reminders pass through; all-day ones land on
    /// 23:59 local of that day.
    public static func dueAt(
        for reminder: ImportedReminder, calendar: Calendar = .current
    ) -> Date? {
        guard let due = reminder.dueDate else { return nil }
        guard reminder.dueIsAllDay else { return due }
        let start = calendar.startOfDay(for: due)
        return calendar.date(bySettingHour: 23, minute: 59, second: 0, of: start) ?? due
    }

    /// Project names the import needs but that don't exist yet in the space
    /// (case-insensitive), in first-appearance order.
    public static func missingProjectNames(
        for reminders: [ImportedReminder], existing: [Project]
    ) -> [String] {
        let existingNames = Set(existing.map { $0.name.lowercased() })
        var seen = Set<String>()
        var missing: [String] = []
        for reminder in reminders {
            guard
                let name = projectName(
                    listName: reminder.listName, sectionName: reminder.sectionName),
                !existingNames.contains(name.lowercased()),
                seen.insert(name.lowercased()).inserted
            else { continue }
            missing.append(name)
        }
        return missing
    }

    /// One reminder → one insert payload. `projectIds` is keyed by lowercased
    /// project name; `parentTaskId` is resolved by the caller once parents
    /// have ids.
    public static func payload(
        for reminder: ImportedReminder,
        spaceId: UUID,
        userId: UUID,
        projectIds: [String: UUID],
        parentTaskId: UUID? = nil,
        calendar: Calendar = .current
    ) -> NewTaskPayload {
        let project = projectName(
            listName: reminder.listName, sectionName: reminder.sectionName)
        let title = reminder.title.trimmingCharacters(in: .whitespacesAndNewlines)
        let notes = reminder.notes?.trimmingCharacters(in: .whitespacesAndNewlines)
        return NewTaskPayload(
            spaceId: spaceId,
            createdBy: userId,
            title: title.isEmpty ? "Untitled" : title,
            notes: (notes?.isEmpty ?? true) ? nil : notes,
            status: reminder.isCompleted ? .done : status(forList: reminder.listName),
            projectId: project.flatMap { projectIds[$0.lowercased()] },
            parentTaskId: parentTaskId,
            urgency: urgency(forPriority: reminder.priority),
            dueAt: dueAt(for: reminder, calendar: calendar),
            contextTags: reminder.tags,
            recurrenceRule: reminder.isCompleted
                ? nil : recurrenceRule(for: reminder.recurrence),
            completedAt: reminder.isCompleted ? reminder.completionDate : nil,
            externalRef: externalRef(for: reminder.externalId))
    }
}

/// Outcome of one import run, for the summary UI.
public struct RemindersImportSummary: Sendable {
    public var importedTasks = 0
    public var importedSubtasks = 0
    public var skippedExisting = 0
    public var createdProjects: [String] = []
    /// Titles whose recurrence rule couldn't be expressed and was dropped.
    public var droppedRecurrences: [String] = []
    /// Subtasks whose parent wasn't part of the import (or previously
    /// imported); they were imported flat instead.
    public var flattenedSubtasks = 0

    public init() {}
}

/// Drives one import run against the repositories. EventKit-free: callers
/// hand in `[ImportedReminder]` snapshots.
public struct RemindersImporter: Sendable {
    let ctx: RepositoryContext

    public init(_ ctx: RepositoryContext) {
        self.ctx = ctx
    }

    public func run(
        _ reminders: [ImportedReminder], calendar: Calendar = .current
    ) async throws -> RemindersImportSummary {
        var summary = RemindersImportSummary()
        let tasks = TaskRepository(ctx)
        let projectRepo = ProjectRepository(ctx)

        // Skip reminders imported by a previous run.
        var refToTaskId = try await tasks.externalRefs()
        let fresh = reminders.filter {
            refToTaskId[RemindersImport.externalRef(for: $0.externalId)] == nil
        }
        summary.skippedExisting = reminders.count - fresh.count

        // Ensure every needed project exists.
        let existingProjects = try await projectRepo.projects()
        var projectIds = [String: UUID](
            existingProjects.map { ($0.name.lowercased(), $0.id) },
            uniquingKeysWith: { first, _ in first })
        for name in RemindersImport.missingProjectNames(
            for: fresh, existing: existingProjects)
        {
            let project = try await projectRepo.create(name: name)
            projectIds[name.lowercased()] = project.id
            summary.createdProjects.append(name)
        }

        for reminder in fresh
        where reminder.recurrence != nil && !reminder.isCompleted
            && RemindersImport.recurrenceRule(for: reminder.recurrence) == nil
        {
            summary.droppedRecurrences.append(reminder.title)
        }

        // Parents first, then children with parent_task_id resolved. A child
        // whose parent is neither in this batch nor previously imported is
        // imported flat.
        let freshIds = Set(fresh.map(\.externalId))
        let parents = fresh.filter { reminder in
            guard let parent = reminder.parentExternalId else { return true }
            return !freshIds.contains(parent)
                && refToTaskId[RemindersImport.externalRef(for: parent)] == nil
        }
        summary.flattenedSubtasks = parents.filter { $0.parentExternalId != nil }.count

        let inserted = try await tasks.createMany(
            parents.map {
                RemindersImport.payload(
                    for: $0, spaceId: ctx.spaceId, userId: ctx.userId,
                    projectIds: projectIds, calendar: calendar)
            })
        summary.importedTasks = inserted.count
        for task in inserted {
            if let ref = task.externalRef { refToTaskId[ref] = task.id }
        }

        let children = fresh.filter { reminder in
            guard let parent = reminder.parentExternalId else { return false }
            return refToTaskId[RemindersImport.externalRef(for: parent)] != nil
        }
        let insertedChildren = try await tasks.createMany(
            children.map { reminder in
                RemindersImport.payload(
                    for: reminder, spaceId: ctx.spaceId, userId: ctx.userId,
                    projectIds: projectIds,
                    parentTaskId: reminder.parentExternalId.flatMap {
                        refToTaskId[RemindersImport.externalRef(for: $0)]
                    },
                    calendar: calendar)
            })
        summary.importedSubtasks = insertedChildren.count
        return summary
    }
}
