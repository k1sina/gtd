// Completing a recurring task spawns its next occurrence. This is THE
// definition of that insert for all TypeScript clients (web UI, web
// assistant, MCP server); Swift mirrors it in
// TaskRepository.nextOccurrencePayload — keep the two in sync.

import { nextOccurrence } from "./recurrence";
import type { Energy, Task, TaskStatus } from "./types";

/** The columns the spawn logic reads — satisfied by the full Task row. */
export type CompletableTask = Pick<
  Task,
  | "id"
  | "space_id"
  | "project_id"
  | "parent_task_id"
  | "assigned_to"
  | "title"
  | "notes"
  | "status"
  | "urgency"
  | "importance"
  | "due_at"
  | "estimated_minutes"
  | "energy"
  | "context_tags"
  | "recurrence_rule"
  | "recurrence_parent_id"
  | "sort_order"
>;

export interface NextOccurrenceInsert {
  space_id: string;
  project_id: string | null;
  created_by: string;
  assigned_to: string | null;
  title: string;
  notes: string | null;
  status: TaskStatus;
  urgency: number;
  importance: number;
  due_at: string;
  estimated_minutes: number | null;
  energy: Energy | null;
  context_tags: string[];
  recurrence_rule: string;
  recurrence_parent_id: string;
  sort_order: number;
}

/**
 * The row to insert when `task` is completed, or null when nothing should
 * spawn (no rule, unsupported rule, or a sub-task — sub-tasks never recur on
 * their own). The due date anchors on the completed occurrence's due date
 * (falling back to `now`), and the copy keeps the task in the inbox if it
 * was never clarified.
 */
export function nextOccurrenceInsert(
  task: CompletableTask,
  createdBy: string,
  now: Date = new Date()
): NextOccurrenceInsert | null {
  if (!task.recurrence_rule || task.parent_task_id) return null;
  const anchor = task.due_at ? new Date(task.due_at) : now;
  const next = nextOccurrence(task.recurrence_rule, anchor, now);
  if (!next) return null;
  return {
    space_id: task.space_id,
    project_id: task.project_id,
    created_by: createdBy,
    assigned_to: task.assigned_to,
    title: task.title,
    notes: task.notes,
    status: task.status === "inbox" ? "inbox" : "next",
    urgency: task.urgency,
    importance: task.importance,
    due_at: next.toISOString(),
    estimated_minutes: task.estimated_minutes,
    energy: task.energy,
    context_tags: task.context_tags,
    recurrence_rule: task.recurrence_rule,
    recurrence_parent_id: task.recurrence_parent_id ?? task.id,
    sort_order: task.sort_order,
  };
}
