import ClarityCore
import Foundation
import Testing
@testable import ClarityKit

private func makeTask(
    status: TaskStatus = .next,
    dueAt: Date? = nil,
    recurrenceRule: String? = nil,
    parentTaskId: UUID? = nil,
    recurrenceParentId: UUID? = nil
) -> TaskItem {
    TaskItem(
        id: UUID(), spaceId: UUID(), projectId: UUID(), parentTaskId: parentTaskId,
        createdBy: UUID(), assignedTo: nil, title: "Water plants", notes: "Back porch",
        status: status, urgency: 3, importance: 2, dueAt: dueAt, deferUntil: nil,
        estimatedMinutes: 15, energy: .low, contextTags: ["home"], waitingOn: nil,
        recurrenceRule: recurrenceRule, recurrenceParentId: recurrenceParentId,
        sortOrder: 1.5, completedAt: nil, createdAt: Date(), updatedAt: Date())
}

@Suite struct RecurrenceCompletionTests {
    let now = date("2026-07-07T10:00:00")
    let userId = UUID()

    @Test func recurringTaskSpawnsFullCopy() throws {
        let task = makeTask(
            dueAt: date("2026-07-07T09:00:00"), recurrenceRule: "FREQ=DAILY;INTERVAL=3")
        let payload = try #require(
            TaskRepository.nextOccurrencePayload(for: task, completedBy: userId, now: now))
        #expect(payload.dueAt == date("2026-07-10T09:00:00"))
        #expect(payload.title == task.title)
        #expect(payload.notes == task.notes)
        #expect(payload.projectId == task.projectId)
        #expect(payload.estimatedMinutes == 15)
        #expect(payload.energy == .low)
        #expect(payload.contextTags == ["home"])
        #expect(payload.sortOrder == 1.5)
        #expect(payload.recurrenceRule == task.recurrenceRule)
        #expect(payload.recurrenceParentId == task.id)
        #expect(payload.createdBy == userId)
        #expect(payload.status == .next)
    }

    @Test func inboxRecurringTaskStaysInInbox() throws {
        let task = makeTask(
            status: .inbox, dueAt: date("2026-07-07T09:00:00"),
            recurrenceRule: "FREQ=DAILY;INTERVAL=1")
        let payload = try #require(
            TaskRepository.nextOccurrencePayload(for: task, completedBy: userId, now: now))
        #expect(payload.status == .inbox)
    }

    @Test func existingRecurrenceParentIsPreserved() throws {
        let rootId = UUID()
        let task = makeTask(
            dueAt: date("2026-07-07T09:00:00"), recurrenceRule: "FREQ=DAILY;INTERVAL=1",
            recurrenceParentId: rootId)
        let payload = try #require(
            TaskRepository.nextOccurrencePayload(for: task, completedBy: userId, now: now))
        #expect(payload.recurrenceParentId == rootId)
    }

    @Test func nonRecurringAndSubTasksSpawnNothing() {
        #expect(
            TaskRepository.nextOccurrencePayload(
                for: makeTask(), completedBy: userId, now: now) == nil)
        #expect(
            TaskRepository.nextOccurrencePayload(
                for: makeTask(recurrenceRule: "FREQ=DAILY;INTERVAL=1", parentTaskId: UUID()),
                completedBy: userId, now: now) == nil)
    }
}

@Suite struct QuickAddPayloadTests {
    let now = date("2026-07-07T10:00:00")

    @Test func mapsParseOntoPayload() {
        let spaceId = UUID()
        let userId = UUID()
        let family = Project(
            id: UUID(), spaceId: spaceId, name: "Family", outcome: nil,
            status: "active", sortOrder: 0)
        let parsed = parseQuickAdd(
            "Call mom tomorrow at 3pm @phone #Family !urgent ~15m", now: now)
        let payload = NewTaskPayload(
            parsed: parsed, spaceId: spaceId, createdBy: userId, projects: [family])
        #expect(payload.title == "Call mom")
        #expect(payload.projectId == family.id)
        #expect(payload.urgency == 4)
        #expect(payload.importance == 2)
        #expect(payload.estimatedMinutes == 15)
        #expect(payload.contextTags == ["phone"])
        #expect(payload.status == .inbox)
    }

    @Test func somedayGoesToSomeday() {
        let parsed = parseQuickAdd("Learn piano !someday", now: now)
        let payload = NewTaskPayload(parsed: parsed, spaceId: UUID(), createdBy: UUID())
        #expect(payload.status == .someday)
    }
}

@Suite struct ProjectSummaryTests {
    @Test func stalledMeansActiveWithNoNextAction() {
        let spaceId = UUID()
        let active = Project(
            id: UUID(), spaceId: spaceId, name: "Active", outcome: nil,
            status: "active", sortOrder: 0)
        let moving = Project(
            id: UUID(), spaceId: spaceId, name: "Moving", outcome: nil,
            status: "active", sortOrder: 1)
        var waiting = makeTask(status: .waiting)
        waiting.projectId = active.id
        var next = makeTask(status: .next)
        next.projectId = moving.id
        var done = makeTask(status: .done)
        done.projectId = moving.id

        let summaries = ProjectSummary.summarize(
            projects: [active, moving], tasks: [waiting, next, done])
        #expect(summaries[0].stalled == true)
        #expect(summaries[0].openTasks == 1)
        #expect(summaries[1].stalled == false)
        #expect(summaries[1].openTasks == 1)
        #expect(summaries[1].doneTasks == 1)
    }
}

@Suite struct DateKeyTests {
    @Test func formatsLocalDay() {
        let key = HabitRepository.dateKey(for: date("2026-07-07T00:30:00"))
        #expect(key == "2026-07-07")
    }
}
