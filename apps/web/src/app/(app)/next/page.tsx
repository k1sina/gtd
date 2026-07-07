"use client";

import { byPriority, isDeferred, type Energy } from "@gtd/shared";
import clsx from "clsx";
import { LayoutList } from "lucide-react";
import { useMemo, useState } from "react";
import { PageHeader, TaskList } from "@/components/task-list";
import { EmptyState } from "@/components/ui";
import { useTasks } from "@/lib/data";
import { useSpace } from "@/lib/space-context";

export default function NextPage() {
  const { currentSpace } = useSpace();
  const { data: tasks = [] } = useTasks(currentSpace?.id);
  const [tag, setTag] = useState<string | null>(null);
  const [energy, setEnergy] = useState<Energy | null>(null);

  const now = new Date();

  const nextTasks = useMemo(
    () =>
      tasks
        .filter(
          (t) =>
            t.status === "next" && !t.parent_task_id && !isDeferred(t, now)
        )
        .sort(byPriority(now)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks]
  );

  const allTags = useMemo(
    () => [...new Set(nextTasks.flatMap((t) => t.context_tags))].sort(),
    [nextTasks]
  );

  const filtered = nextTasks.filter(
    (t) =>
      (!tag || t.context_tags.includes(tag)) &&
      (!energy || t.energy === energy)
  );

  return (
    <div>
      <PageHeader
        title="Next actions"
        subtitle="Everything you could do next, highest leverage first"
      />

      {(allTags.length > 0 || nextTasks.some((t) => t.energy)) && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          {allTags.map((t) => (
            <button
              key={t}
              onClick={() => setTag(tag === t ? null : t)}
              className={clsx(
                "rounded-full border px-2.5 py-1 text-xs cursor-pointer",
                tag === t
                  ? "border-accent bg-accent-soft text-accent font-medium"
                  : "border-line text-ink-soft hover:border-accent"
              )}
            >
              @{t}
            </button>
          ))}
          <span className="mx-1 h-4 border-l border-line" />
          {(["low", "medium", "high"] as const).map((e) => (
            <button
              key={e}
              onClick={() => setEnergy(energy === e ? null : e)}
              className={clsx(
                "rounded-full border px-2.5 py-1 text-xs cursor-pointer",
                energy === e
                  ? "border-accent bg-accent-soft text-accent font-medium"
                  : "border-line text-ink-soft hover:border-accent"
              )}
            >
              {e} energy
            </button>
          ))}
        </div>
      )}

      <TaskList
        tasks={filtered}
        emptyState={
          <EmptyState
            icon={<LayoutList size={22} />}
            title={
              nextTasks.length === 0
                ? "No next actions"
                : "Nothing matches the filters"
            }
            hint={
              nextTasks.length === 0
                ? "Clarify your inbox to line up next actions."
                : undefined
            }
          />
        }
      />
    </div>
  );
}
