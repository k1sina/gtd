"use client";

import { Hourglass } from "lucide-react";
import { useMemo } from "react";
import { FilterChips, useTaskFilters } from "@/components/filter-chips";
import { PageHeader, TaskList } from "@/components/task-list";
import { EmptyState } from "@/components/ui";
import { useTasks } from "@/lib/data";
import { useSpace } from "@/lib/space-context";

export default function WaitingPage() {
  const { currentSpace } = useSpace();
  const { data: tasks = [] } = useTasks(currentSpace?.id);

  const waiting = useMemo(
    () =>
      tasks
        .filter((t) => t.status === "waiting" && !t.parent_task_id)
        .sort(
          (a, b) =>
            new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()
        ),
    [tasks]
  );

  // Contexts double as agendas here (@sara, @boss — GTD's per-person lists).
  const { tag, setTag, energy, setEnergy, allTags, filtered } = useTaskFilters(
    waiting,
    "clarity.filters.waiting"
  );

  return (
    <div>
      <PageHeader
        title="Waiting for"
        subtitle="Delegated or blocked — chase these during your weekly review"
      />
      <FilterChips
        tag={tag}
        setTag={setTag}
        energy={energy}
        setEnergy={setEnergy}
        allTags={allTags}
        showEnergy={waiting.some((t) => t.energy)}
      />
      <TaskList
        tasks={filtered}
        emptyState={
          <EmptyState
            icon={<Hourglass size={22} />}
            title={
              waiting.length === 0
                ? "Not waiting on anyone"
                : "Nothing matches the filters"
            }
            hint={
              waiting.length === 0
                ? "When you delegate something, clarify it as “Waiting for” to track it here."
                : undefined
            }
          />
        }
      />
    </div>
  );
}
