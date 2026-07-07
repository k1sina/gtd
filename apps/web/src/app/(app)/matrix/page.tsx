"use client";

import type { Quadrant, Task } from "@gtd/shared";
import { QUADRANT_LABELS, byPriority, isDeferred, quadrant } from "@gtd/shared";
import clsx from "clsx";
import { useMemo, useState } from "react";
import { TaskDetail } from "@/components/task-detail";
import { PageHeader } from "@/components/task-list";
import { Checkbox } from "@/components/ui";
import { useCompleteTask, useTasks, useUpdateTask } from "@/lib/data";
import { useSpace } from "@/lib/space-context";

// Representative urgency/importance values applied when a task is dragged
// into a quadrant (only axes that change quadrant membership are moved).
const QUADRANT_VALUES: Record<Quadrant, { urgency: number; importance: number }> = {
  do: { urgency: 4, importance: 4 },
  schedule: { urgency: 2, importance: 4 },
  delegate: { urgency: 4, importance: 2 },
  eliminate: { urgency: 2, importance: 2 },
};

const QUADRANT_STYLE: Record<
  Quadrant,
  { border: string; heading: string; hint: string }
> = {
  do: { border: "border-q-do/30", heading: "text-q-do", hint: "Urgent + important" },
  schedule: {
    border: "border-q-schedule/30",
    heading: "text-q-schedule",
    hint: "Important, not urgent",
  },
  delegate: {
    border: "border-q-delegate/30",
    heading: "text-q-delegate",
    hint: "Urgent, not important",
  },
  eliminate: {
    border: "border-q-eliminate/40",
    heading: "text-q-eliminate",
    hint: "Neither — reconsider",
  },
};

function MatrixCell({
  q,
  tasks,
  onDropTask,
  onOpen,
}: {
  q: Quadrant;
  tasks: Task[];
  onDropTask: (taskId: string, q: Quadrant) => void;
  onOpen: (t: Task) => void;
}) {
  const completeTask = useCompleteTask();
  const [over, setOver] = useState(false);
  const style = QUADRANT_STYLE[q];

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const id = e.dataTransfer.getData("text/task-id");
        if (id) onDropTask(id, q);
      }}
      className={clsx(
        "flex min-h-56 flex-col rounded-xl border-2 bg-surface p-3 transition-colors",
        style.border,
        over && "bg-accent-soft/60"
      )}
    >
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className={clsx("text-sm font-semibold", style.heading)}>
          {QUADRANT_LABELS[q]}
        </h2>
        <span className="text-[10px] text-ink-faint">{style.hint}</span>
      </div>
      <div className="thin-scroll flex max-h-72 flex-col gap-1 overflow-y-auto">
        {tasks.map((t) => (
          <div
            key={t.id}
            draggable
            onDragStart={(e) => e.dataTransfer.setData("text/task-id", t.id)}
            onClick={() => onOpen(t)}
            className="flex cursor-grab items-center gap-2 rounded-md border border-line bg-canvas/60 px-2 py-1.5 text-sm hover:border-accent active:cursor-grabbing"
          >
            <Checkbox
              checked={false}
              onChange={() => completeTask.mutate({ task: t, done: true })}
            />
            <span className="truncate">{t.title}</span>
          </div>
        ))}
        {tasks.length === 0 && (
          <p className="mt-4 text-center text-xs text-ink-faint">
            Drag tasks here
          </p>
        )}
      </div>
    </div>
  );
}

export default function MatrixPage() {
  const { currentSpace } = useSpace();
  const { data: tasks = [] } = useTasks(currentSpace?.id);
  const updateTask = useUpdateTask();
  const [selected, setSelected] = useState<Task | null>(null);

  const now = new Date();
  const open = useMemo(
    () =>
      tasks
        .filter(
          (t) =>
            !t.parent_task_id &&
            ["next", "scheduled", "inbox", "waiting"].includes(t.status) &&
            !isDeferred(t, now)
        )
        .sort(byPriority(now)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks]
  );

  const byQuadrant = (q: Quadrant) =>
    open.filter((t) => quadrant(t.urgency, t.importance) === q);

  const dropTask = (taskId: string, q: Quadrant) => {
    const task = open.find((t) => t.id === taskId);
    if (!task || quadrant(task.urgency, task.importance) === q) return;
    updateTask.mutate({ id: taskId, ...QUADRANT_VALUES[q] });
  };

  return (
    <div>
      <PageHeader
        title="Priority matrix"
        subtitle="Urgency × importance — drag tasks between quadrants to re-prioritise"
      />
      <div className="grid grid-cols-2 gap-3">
        {(["do", "schedule", "delegate", "eliminate"] as Quadrant[]).map((q) => (
          <MatrixCell
            key={q}
            q={q}
            tasks={byQuadrant(q)}
            onDropTask={dropTask}
            onOpen={setSelected}
          />
        ))}
      </div>
      <TaskDetail task={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
