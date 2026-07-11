"use client";

import type { Task } from "@gtd/shared";
import { describeRule, quadrant } from "@gtd/shared";
import clsx from "clsx";
import {
  AlarmClock,
  AlarmClockOff,
  CornerDownRight,
  Hourglass,
  RefreshCcw,
  Tag,
} from "lucide-react";
import { useCompleteTask, useUndoComplete } from "@/lib/data";
import { formatDue, formatMinutes } from "@/lib/format";
import { useToast } from "./toast";
import { Badge, Checkbox } from "./ui";

/** "3d" / "5w" since the task last changed — how long a Waiting-For has been waiting. */
function waitingAge(task: Task): string | null {
  if (task.status !== "waiting") return null;
  const days = Math.floor(
    (Date.now() - new Date(task.updated_at).getTime()) / 86_400_000
  );
  if (days < 1) return null;
  return days < 14 ? `${days}d` : `${Math.floor(days / 7)}w`;
}

const QUADRANT_DOT: Record<string, string> = {
  do: "bg-q-do",
  schedule: "bg-q-schedule",
  delegate: "bg-q-delegate",
  eliminate: "bg-q-eliminate",
};

export function TaskRow({
  task,
  subtaskStats,
  actionSubtask = null,
  stalled = false,
  onOpen,
  indent = false,
}: {
  task: Task;
  subtaskStats?: { done: number; total: number };
  /** Surfaced next action of a parent task: shown as the action line, and the
   * checkbox completes it (opening the row still opens the parent). */
  actionSubtask?: Task | null;
  stalled?: boolean;
  onOpen?: (task: Task) => void;
  indent?: boolean;
}) {
  const completeTask = useCompleteTask();
  const undoComplete = useUndoComplete();
  const toast = useToast();
  // The checkbox acts on the surfaced subtask when there is one.
  const actionTask = actionSubtask ?? task;
  const done = actionTask.status === "done";
  const due = task.due_at ? formatDue(task.due_at) : null;
  const age = waitingAge(task);
  const snoozedUntil =
    task.defer_until && new Date(task.defer_until) > new Date()
      ? new Date(task.defer_until).toLocaleDateString([], {
          month: "short",
          day: "numeric",
        })
      : null;

  function toggleDone(v: boolean) {
    // Fire the toast at click time: the optimistic update unmounts this row
    // immediately, and unmounted components never receive mutate callbacks.
    const promise = completeTask.mutateAsync({ task: actionTask, done: v });
    promise.catch(() => toast("Couldn’t save that — try again", { tone: "danger" }));
    if (!v) return;
    toast(
      actionTask.recurrence_rule
        ? "Completed — next occurrence scheduled"
        : `Completed “${actionTask.title}”`,
      {
        action: {
          label: "Undo",
          onClick: () => {
            promise
              .then((receipt) => undoComplete.mutate({ task: actionTask, receipt }))
              .catch(() => {});
          },
        },
      }
    );
  }

  return (
    <div
      onClick={() => onOpen?.(task)}
      className={clsx(
        "group flex cursor-pointer items-start gap-2.5 rounded-lg border border-transparent px-2.5 py-2 hover:border-line hover:bg-surface",
        indent && "ml-7"
      )}
    >
      {indent && (
        <CornerDownRight size={13} className="mt-1 shrink-0 text-ink-faint" />
      )}
      <div className="mt-0.5">
        <Checkbox
          checked={done}
          onChange={toggleDone}
          title={done ? "Mark as not done" : "Mark as done"}
        />
      </div>
      <div className="min-w-0 flex-1">
        {actionSubtask && (
          <p className="truncate text-[11px] text-ink-faint">{task.title}</p>
        )}
        <div className="flex items-center gap-2">
          <span
            className={clsx(
              "h-1.5 w-1.5 shrink-0 rounded-full",
              QUADRANT_DOT[quadrant(actionTask.urgency, actionTask.importance)]
            )}
            title={`urgency ${actionTask.urgency} · importance ${actionTask.importance}`}
          />
          <p
            className={clsx(
              "truncate text-sm",
              done && "text-ink-faint line-through"
            )}
          >
            {actionTask.title}
          </p>
        </div>
        {(due ||
          snoozedUntil ||
          age ||
          stalled ||
          task.context_tags.length > 0 ||
          task.recurrence_rule ||
          task.estimated_minutes ||
          task.waiting_on ||
          subtaskStats) && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {stalled && (
              <span
                title="No next action — decide the next step"
                className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-600"
              >
                stalled
              </span>
            )}
            {due && (
              <Badge tone={due.tone === "neutral" ? "neutral" : due.tone}>
                {due.label}
              </Badge>
            )}
            {snoozedUntil && (
              <Badge tone="neutral">
                <AlarmClockOff size={10} />
                hidden until {snoozedUntil}
              </Badge>
            )}
            {(task.waiting_on || age) && (
              <Badge tone="amber">
                <Hourglass size={10} />
                {task.waiting_on ?? "waiting"}
                {age && <span className="opacity-70">· {age}</span>}
              </Badge>
            )}
            {subtaskStats && subtaskStats.total > 0 && (
              <Badge tone="neutral">
                {subtaskStats.done}/{subtaskStats.total} subtasks
              </Badge>
            )}
            {task.recurrence_rule && (
              <Badge tone="blue">
                <RefreshCcw size={10} />
                {describeRule(task.recurrence_rule)}
              </Badge>
            )}
            {task.estimated_minutes && (
              <Badge tone="neutral">
                <AlarmClock size={10} />
                {formatMinutes(task.estimated_minutes)}
              </Badge>
            )}
            {task.context_tags.map((t) => (
              <Badge key={t} tone="neutral">
                <Tag size={10} />
                {t}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
