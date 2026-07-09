"use client";

import type { Quadrant, Task } from "@gtd/shared";
import { QUADRANT_LABELS, byPriority, isDeferred, quadrant } from "@gtd/shared";
import clsx from "clsx";
import { useMemo, useState } from "react";
import { TaskDetail } from "@/components/task-detail";
import { PageHeader } from "@/components/task-list";
import { useToast } from "@/components/toast";
import { Checkbox } from "@/components/ui";
import { useCompleteTask, useTasks, useUndoComplete, useUpdateTask } from "@/lib/data";
import { useSpace } from "@/lib/space-context";

// Representative urgency/importance values applied when a task is dragged
// into a quadrant. "Eliminate" uses 1/1 (not the 2/2 defaults) so a
// deliberate drop there is distinguishable from a never-rated task.
const QUADRANT_VALUES: Record<Quadrant, { urgency: number; importance: number }> = {
  do: { urgency: 4, importance: 4 },
  schedule: { urgency: 2, importance: 4 },
  delegate: { urgency: 4, importance: 2 },
  eliminate: { urgency: 1, importance: 1 },
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

function DraggableTask({
  task,
  onOpen,
}: {
  task: Task;
  onOpen: (t: Task) => void;
}) {
  const completeTask = useCompleteTask();
  const undoComplete = useUndoComplete();
  const toast = useToast();

  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/task-id", task.id)}
      onClick={() => onOpen(task)}
      className="flex cursor-grab items-center gap-2 rounded-md border border-line bg-canvas/60 px-2 py-1.5 text-sm hover:border-accent active:cursor-grabbing"
    >
      <Checkbox
        checked={false}
        onChange={() => {
          // Toast fires at click time — the optimistic update unmounts this
          // row before mutate callbacks would run.
          const promise = completeTask.mutateAsync({ task, done: true });
          promise.catch(() =>
            toast("Couldn’t save that — try again", { tone: "danger" })
          );
          toast(`Completed “${task.title}”`, {
            action: {
              label: "Undo",
              onClick: () => {
                promise
                  .then((receipt) => undoComplete.mutate({ task, receipt }))
                  .catch(() => {});
              },
            },
          });
        }}
      />
      <span className="truncate">{task.title}</span>
    </div>
  );
}

function DropZone({
  onDropTask,
  className,
  children,
}: {
  onDropTask: (taskId: string) => void;
  className: (over: boolean) => string;
  children: React.ReactNode;
}) {
  const [over, setOver] = useState(false);
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
        if (id) onDropTask(id);
      }}
      className={className(over)}
    >
      {children}
    </div>
  );
}

export default function MatrixPage() {
  const { currentSpace } = useSpace();
  const { data: tasks = [] } = useTasks(currentSpace?.id);
  const updateTask = useUpdateTask();
  const [selected, setSelected] = useState<Task | null>(null);

  const now = new Date();
  // Inbox items are unclarified — they don't belong on the matrix yet.
  const open = useMemo(
    () =>
      tasks
        .filter(
          (t) =>
            !t.parent_task_id &&
            ["next", "scheduled", "waiting"].includes(t.status) &&
            !isDeferred(t, now)
        )
        .sort(byPriority(now)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks]
  );

  // Tasks still at the 2/2 defaults have never been prioritised — keep them
  // out of the quadrants (especially "Eliminate") until the user rates them.
  const unrated = open.filter((t) => t.urgency === 2 && t.importance === 2);
  const rated = open.filter((t) => !(t.urgency === 2 && t.importance === 2));

  const byQuadrant = (q: Quadrant) =>
    rated.filter((t) => quadrant(t.urgency, t.importance) === q);

  const dropTask = (taskId: string, q: Quadrant) => {
    const task = open.find((t) => t.id === taskId);
    if (!task) return;
    updateTask.mutate({ id: taskId, ...QUADRANT_VALUES[q] });
  };

  return (
    <div>
      <PageHeader
        title="Priority matrix"
        subtitle="Urgency × importance — drag tasks between quadrants to re-prioritise"
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {(["do", "schedule", "delegate", "eliminate"] as Quadrant[]).map((q) => {
          const style = QUADRANT_STYLE[q];
          const cellTasks = byQuadrant(q);
          return (
            <DropZone
              key={q}
              onDropTask={(id) => dropTask(id, q)}
              className={(over) =>
                clsx(
                  "flex min-h-56 flex-col rounded-xl border-2 bg-surface p-3 transition-colors",
                  style.border,
                  over && "bg-accent-soft/60"
                )
              }
            >
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className={clsx("text-sm font-semibold", style.heading)}>
                  {QUADRANT_LABELS[q]}
                </h2>
                <span className="text-[10px] text-ink-faint">{style.hint}</span>
              </div>
              <div className="thin-scroll flex max-h-72 flex-col gap-1 overflow-y-auto">
                {cellTasks.map((t) => (
                  <DraggableTask key={t.id} task={t} onOpen={setSelected} />
                ))}
                {cellTasks.length === 0 && (
                  <p className="mt-4 text-center text-xs text-ink-faint">
                    Drag tasks here
                  </p>
                )}
              </div>
            </DropZone>
          );
        })}
      </div>

      {unrated.length > 0 && (
        <div className="mt-3 rounded-xl border-2 border-dashed border-line bg-surface p-3">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-ink-soft">Unrated</h2>
            <span className="text-[10px] text-ink-faint">
              Not prioritised yet — drag each one into a quadrant
            </span>
          </div>
          <div className="thin-scroll flex max-h-56 flex-col gap-1 overflow-y-auto">
            {unrated.map((t) => (
              <DraggableTask key={t.id} task={t} onOpen={setSelected} />
            ))}
          </div>
        </div>
      )}

      {selected && (
        <TaskDetail
          key={selected.id}
          task={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
