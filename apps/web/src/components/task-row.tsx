"use client";

import type { Project, Task } from "@gtd/shared";
import { describeRule, quadrant } from "@gtd/shared";
import clsx from "clsx";
import {
  AlarmClock,
  CornerDownRight,
  Hourglass,
  RefreshCcw,
  Tag,
} from "lucide-react";
import { useCompleteTask } from "@/lib/data";
import { formatDue, formatMinutes } from "@/lib/format";
import { Badge, Checkbox } from "./ui";

const QUADRANT_DOT: Record<string, string> = {
  do: "bg-q-do",
  schedule: "bg-q-schedule",
  delegate: "bg-q-delegate",
  eliminate: "bg-q-eliminate",
};

export function TaskRow({
  task,
  project,
  subtaskStats,
  onOpen,
  showProject = true,
  indent = false,
}: {
  task: Task;
  project?: Project | null;
  subtaskStats?: { done: number; total: number };
  onOpen?: (task: Task) => void;
  showProject?: boolean;
  indent?: boolean;
}) {
  const completeTask = useCompleteTask();
  const done = task.status === "done";
  const due = task.due_at ? formatDue(task.due_at) : null;

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
          onChange={(v) => completeTask.mutate({ task, done: v })}
          title={done ? "Mark as not done" : "Mark as done"}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={clsx(
              "h-1.5 w-1.5 shrink-0 rounded-full",
              QUADRANT_DOT[quadrant(task.urgency, task.importance)]
            )}
            title={`urgency ${task.urgency} · importance ${task.importance}`}
          />
          <p
            className={clsx(
              "truncate text-sm",
              done && "text-ink-faint line-through"
            )}
          >
            {task.title}
          </p>
        </div>
        {(due ||
          task.context_tags.length > 0 ||
          (showProject && project) ||
          task.recurrence_rule ||
          task.estimated_minutes ||
          task.waiting_on ||
          subtaskStats) && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {due && (
              <Badge tone={due.tone === "neutral" ? "neutral" : due.tone}>
                {due.label}
              </Badge>
            )}
            {task.waiting_on && (
              <Badge tone="amber">
                <Hourglass size={10} />
                {task.waiting_on}
              </Badge>
            )}
            {showProject && project && (
              <Badge tone="accent">{project.name}</Badge>
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
