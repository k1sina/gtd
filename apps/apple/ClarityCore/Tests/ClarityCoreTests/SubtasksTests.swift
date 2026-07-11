import Foundation
import Testing
@testable import ClarityCore

// Mirrors packages/shared/test/subtasks.test.ts — keep the tables in sync.

private var seq = 0

private func node(
    id: UUID,
    parent: UUID? = nil,
    status: TaskStatus = .next,
    sortOrder: Double = 0,
    createdAt: Date? = nil,
    deferUntil: Date? = nil
) -> TaskItem {
    seq += 1
    return TaskItem(
        id: id, spaceId: UUID(), parentTaskId: parent, createdBy: UUID(),
        title: "t", status: status, deferUntil: deferUntil, sortOrder: sortOrder,
        createdAt: createdAt ?? date("2026-07-01T00:00:00").addingTimeInterval(Double(seq)))
}

@Suite struct SubtasksTests {
    let now = date("2026-07-11T12:00:00")
    let p = UUID()

    @Test func hasOpenSubtasksIgnoresClosedChildren() {
        var tasks = [
            node(id: p),
            node(id: UUID(), parent: p, status: .done),
            node(id: UUID(), parent: p, status: .cancelled),
        ]
        #expect(hasOpenSubtasks(p, in: tasks) == false)
        tasks.append(node(id: UUID(), parent: p, status: .waiting))
        #expect(hasOpenSubtasks(p, in: tasks) == true)
    }

    @Test func firstActionableIsLowestSortOrderNextChild() {
        let c = UUID()
        let tasks = [
            node(id: p),
            node(id: UUID(), parent: p, status: .waiting, sortOrder: 0),
            node(id: UUID(), parent: p, sortOrder: 2),
            node(id: c, parent: p, sortOrder: 1),
        ]
        #expect(firstActionableSubtask(of: p, in: tasks, now: now)?.id == c)
    }

    @Test func sortOrderTiesBreakByCreatedAt() {
        let earlier = UUID()
        let tasks = [
            node(id: p),
            node(id: UUID(), parent: p, createdAt: date("2026-07-02T00:00:00")),
            node(id: earlier, parent: p, createdAt: date("2026-07-01T00:00:00")),
        ]
        #expect(firstActionableSubtask(of: p, in: tasks, now: now)?.id == earlier)
    }

    @Test func skipsDeferredChildren() {
        let b = UUID()
        let tasks = [
            node(id: p),
            node(id: UUID(), parent: p, sortOrder: 0, deferUntil: date("2026-08-01T00:00:00")),
            node(id: b, parent: p, sortOrder: 1),
        ]
        #expect(firstActionableSubtask(of: p, in: tasks, now: now)?.id == b)
    }

    @Test func recursesIntoChildWithOpenChildren() {
        let mid = UUID()
        let leaf = UUID()
        let tasks = [
            node(id: p),
            node(id: mid, parent: p, sortOrder: 0),
            node(id: leaf, parent: mid),
            node(id: UUID(), parent: p, sortOrder: 1),
        ]
        #expect(firstActionableSubtask(of: p, in: tasks, now: now)?.id == leaf)
    }

    @Test func fallsBackToMidTaskWhenItsChildrenAreClosed() {
        let mid = UUID()
        let tasks = [
            node(id: p),
            node(id: mid, parent: p),
            node(id: UUID(), parent: mid, status: .done),
        ]
        #expect(firstActionableSubtask(of: p, in: tasks, now: now)?.id == mid)
    }

    @Test func nilWhenNothingActionable() {
        let tasks = [
            node(id: p),
            node(id: UUID(), parent: p, status: .waiting),
            node(id: UUID(), parent: p, status: .someday),
        ]
        #expect(firstActionableSubtask(of: p, in: tasks, now: now) == nil)
    }

    @Test func stalledFlagsLiveParentWithoutNextAction() {
        let parent = node(id: p)
        let tasks = [parent, node(id: UUID(), parent: p, status: .waiting)]
        #expect(isStalledParent(parent, in: tasks, now: now) == true)
    }

    @Test func notStalledWhenActionableSubtaskExists() {
        let parent = node(id: p)
        let tasks = [
            parent,
            node(id: UUID(), parent: p, status: .waiting),
            node(id: UUID(), parent: p),
        ]
        #expect(isStalledParent(parent, in: tasks, now: now) == false)
    }

    @Test func onlyDeferredNextSubtaskCountsAsStalled() {
        let parent = node(id: p)
        let tasks = [
            parent,
            node(id: UUID(), parent: p, deferUntil: date("2026-08-01T00:00:00")),
        ]
        #expect(isStalledParent(parent, in: tasks, now: now) == true)
    }

    @Test func neverFlagsSomedayDoneOrCancelledParents() {
        for status in [TaskStatus.someday, .done, .cancelled] {
            let parent = node(id: p, status: status)
            let tasks = [parent, node(id: UUID(), parent: p, status: .waiting)]
            #expect(isStalledParent(parent, in: tasks, now: now) == false)
        }
    }

    @Test func neverFlagsTaskWithoutOpenSubtasks() {
        let parent = node(id: p)
        #expect(isStalledParent(parent, in: [parent], now: now) == false)
        let tasks = [parent, node(id: UUID(), parent: p, status: .done)]
        #expect(isStalledParent(parent, in: tasks, now: now) == false)
    }

    @Test func isRatedPriorityTreatsOnlyDefaultAsUnrated() {
        #expect(isRatedPriority(urgency: 2, importance: 2) == false)
        #expect(isRatedPriority(urgency: 1, importance: 1) == true)
        #expect(isRatedPriority(urgency: 2, importance: 3) == true)
        #expect(isRatedPriority(urgency: 4, importance: 2) == true)
    }
}
