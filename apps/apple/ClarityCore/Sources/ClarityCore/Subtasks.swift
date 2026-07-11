import Foundation

// A task with subtasks IS a project (GTD: any outcome needing more than one
// action). These helpers define how parents surface in action lists and when
// they count as stalled. Mirrors packages/shared/src/subtasks.ts — keep the
// two and their test tables in sync.

/// The fields the subtask walk reads — satisfied by `TaskItem`.
public protocol SubtaskNode: Prioritizable {
    var id: UUID { get }
    var parentTaskId: UUID? { get }
    var status: TaskStatus { get }
    var sortOrder: Double { get }
    var createdAt: Date { get }
}

extension TaskItem: SubtaskNode {}

private let closedStatuses: Set<TaskStatus> = [.done, .cancelled]

private func openChildren<T: SubtaskNode>(of taskId: UUID, in tasks: [T]) -> [T] {
    tasks
        .filter { $0.parentTaskId == taskId && !closedStatuses.contains($0.status) }
        .sorted {
            $0.sortOrder != $1.sortOrder
                ? $0.sortOrder < $1.sortOrder
                : $0.createdAt < $1.createdAt
        }
}

/// True when the task has at least one subtask that isn't done/cancelled.
public func hasOpenSubtasks(_ taskId: UUID, in tasks: [some SubtaskNode]) -> Bool {
    tasks.contains { $0.parentTaskId == taskId && !closedStatuses.contains($0.status) }
}

/// The subtask to surface as the parent's visible action line: walk open
/// children in sort order, descending into any child that has open children
/// of its own, and return the first leaf-ish `next` action that isn't
/// deferred. Nil when nothing actionable exists (→ the parent is stalled,
/// if it has open subtasks at all).
public func firstActionableSubtask<T: SubtaskNode>(
    of taskId: UUID,
    in tasks: [T],
    now: Date = Date()
) -> T? {
    for child in openChildren(of: taskId, in: tasks) {
        if let deeper = firstActionableSubtask(of: child.id, in: tasks, now: now) {
            return deeper
        }
        if child.status == .next && !isDeferred(child, now: now) {
            return child
        }
    }
    return nil
}

/// A parent is stalled when it's still live (not done/cancelled, and not
/// consciously parked in someday), has open subtasks, but none of them is an
/// actionable next step — the GTD "project with no next action" smell.
public func isStalledParent<T: SubtaskNode>(
    _ task: T,
    in tasks: [T],
    now: Date = Date()
) -> Bool {
    !closedStatuses.contains(task.status)
        && task.status != .someday
        && hasOpenSubtasks(task.id, in: tasks)
        && firstActionableSubtask(of: task.id, in: tasks, now: now) == nil
}
