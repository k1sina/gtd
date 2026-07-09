"use client";

import type { Task } from "@gtd/shared";
import { useMemo, useState } from "react";
import { useProjects, useTasks } from "@/lib/data";
import { useSpace } from "@/lib/space-context";
import { TaskDetail } from "./task-detail";
import { TaskRow } from "./task-row";

/**
 * Renders top-level tasks with selection + detail editing. Subtask counts are
 * derived from the full task cache.
 */
export function TaskList({
  tasks,
  showProject = true,
  emptyState,
}: {
  tasks: Task[];
  showProject?: boolean;
  emptyState?: React.ReactNode;
}) {
  const { currentSpace } = useSpace();
  const { data: allTasks = [] } = useTasks(currentSpace?.id);
  const { data: projects = [] } = useProjects(currentSpace?.id);
  const [selected, setSelected] = useState<Task | null>(null);

  const projectById = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects]
  );

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

  if (tasks.length === 0 && emptyState) return <>{emptyState}</>;

  return (
    <>
      <div className="flex flex-col gap-0.5">
        {tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            project={task.project_id ? projectById.get(task.project_id) : null}
            subtaskStats={subtaskStats.get(task.id)}
            showProject={showProject}
            onOpen={setSelected}
          />
        ))}
      </div>
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
