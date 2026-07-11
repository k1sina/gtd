"use client";

import type { Task } from "@gtd/shared";
import { firstActionableSubtask, isStalledParent, reorderPatches } from "@gtd/shared";
import { useMemo, useState } from "react";
import { useReorderTasks, useTasks } from "@/lib/data";
import { useSpace } from "@/lib/space-context";
import { SortableList } from "./sortable-list";
import { TaskDetail } from "./task-detail";
import { TaskRow } from "./task-row";

/**
 * Renders top-level tasks with selection + detail editing. Subtask counts,
 * the surfaced next-action subtask, and the stalled flag are derived from
 * the full task cache. With `reorderable`, rows get a drag handle and drops
 * persist sort_order (pass it only when `tasks` is sorted by byUserOrder).
 */
export function TaskList({
  tasks,
  emptyState,
  reorderable = false,
}: {
  tasks: Task[];
  emptyState?: React.ReactNode;
  reorderable?: boolean;
}) {
  const { currentSpace } = useSpace();
  const { data: allTasks = [] } = useTasks(currentSpace?.id);
  const reorderTasks = useReorderTasks();
  const [selected, setSelected] = useState<Task | null>(null);

  const subtaskStats = useMemo(() => {
    const stats = new Map<string, { done: number; total: number }>();
    for (const t of allTasks) {
      if (!t.parent_task_id) continue;
      const s = stats.get(t.parent_task_id) ?? { done: 0, total: 0 };
      s.total += 1;
      if (t.status === "done") s.done += 1;
      stats.set(t.parent_task_id, s);
    }
    return stats;
  }, [allTasks]);

  // A parent task surfaces its first actionable subtask as the visible action
  // line; a live parent with open subtasks but no next action is stalled.
  const now = new Date();
  const surfacing = useMemo(() => {
    const map = new Map<string, { actionSubtask: Task | null; stalled: boolean }>();
    for (const t of tasks) {
      if (!subtaskStats.has(t.id)) continue;
      map.set(t.id, {
        actionSubtask:
          t.status === "done" || t.status === "cancelled"
            ? null
            : firstActionableSubtask(t.id, allTasks, now),
        stalled: isStalledParent(t, allTasks, now),
      });
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, allTasks, subtaskStats]);

  if (tasks.length === 0 && emptyState) return <>{emptyState}</>;

  const row = (task: Task) => (
    <TaskRow
      key={task.id}
      task={task}
      subtaskStats={subtaskStats.get(task.id)}
      actionSubtask={surfacing.get(task.id)?.actionSubtask ?? null}
      stalled={surfacing.get(task.id)?.stalled ?? false}
      onOpen={setSelected}
    />
  );

  function handleMove(from: number, to: number) {
    if (!currentSpace) return;
    const patches = reorderPatches(tasks, from, to);
    if (patches.length > 0) {
      reorderTasks.mutate({ spaceId: currentSpace.id, patches });
    }
  }

  return (
    <>
      {reorderable ? (
        <SortableList items={tasks} onMove={handleMove}>
          {row}
        </SortableList>
      ) : (
        <div className="flex flex-col gap-0.5">{tasks.map(row)}</div>
      )}
      {selected && (
        <TaskDetail
          key={selected.id}
          task={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-ink-soft">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}
