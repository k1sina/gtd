// A task with subtasks IS a project (GTD: any outcome needing more than one
// action). These helpers define how parents surface in action lists and when
// they count as stalled. Swift mirrors them in ClarityCore/Subtasks.swift —
// keep the two and their test tables in sync.

import { isDeferred } from "./priority";
import type { Task, TaskStatus } from "./types";

/** The columns the subtask walk reads — satisfied by the full Task row. */
export type SubtaskNode = Pick<
  Task,
  | "id"
  | "parent_task_id"
  | "status"
  | "sort_order"
  | "created_at"
  | "defer_until"
> & { urgency: number; importance: number };

const CLOSED: TaskStatus[] = ["done", "cancelled"];

function openChildren<T extends SubtaskNode>(taskId: string, tasks: T[]): T[] {
  return tasks
    .filter((t) => t.parent_task_id === taskId && !CLOSED.includes(t.status))
    .sort(
      (a, b) =>
        a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)
    );
}

/** True when the task has at least one subtask that isn't done/cancelled. */
export function hasOpenSubtasks(taskId: string, tasks: SubtaskNode[]): boolean {
  return tasks.some(
    (t) => t.parent_task_id === taskId && !CLOSED.includes(t.status)
  );
}

/**
 * The subtask to surface as the parent's visible action line: walk open
 * children in sort order, descending into any child that has open children
 * of its own, and return the first leaf-ish `next` action that isn't
 * deferred. Null when nothing actionable exists (→ the parent is stalled,
 * if it has open subtasks at all).
 */
export function firstActionableSubtask<T extends SubtaskNode>(
  taskId: string,
  tasks: T[],
  now: Date = new Date()
): T | null {
  for (const child of openChildren(taskId, tasks)) {
    const deeper = firstActionableSubtask(child.id, tasks, now);
    if (deeper) return deeper;
    if (child.status === "next" && !isDeferred(child, now)) return child;
  }
  return null;
}

/**
 * A parent is stalled when it's still live (not done/cancelled, and not
 * consciously parked in someday), has open subtasks, but none of them is an
 * actionable next step — the GTD "project with no next action" smell.
 */
export function isStalledParent<T extends SubtaskNode>(
  task: T,
  tasks: T[],
  now: Date = new Date()
): boolean {
  return (
    !CLOSED.includes(task.status) &&
    task.status !== "someday" &&
    hasOpenSubtasks(task.id, tasks) &&
    firstActionableSubtask(task.id, tasks, now) === null
  );
}
