"use client";

import { byUserOrder, isDeferred } from "@gtd/shared";
import { LayoutList } from "lucide-react";
import { useMemo } from "react";
import { FilterChips, useTaskFilters } from "@/components/filter-chips";
import { PageHeader, TaskList } from "@/components/task-list";
import { EmptyState } from "@/components/ui";
import { useTasks } from "@/lib/data";
import { useSpace } from "@/lib/space-context";

export default function NextPage() {
  const { currentSpace } = useSpace();
  const { data: tasks = [] } = useTasks(currentSpace?.id);

  const now = new Date();

  const nextTasks = useMemo(
    () =>
      tasks
        .filter(
          (t) =>
            t.status === "next" && !t.parent_task_id && !isDeferred(t, now)
        )
        .sort(byUserOrder(now)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks]
  );

  const { tag, setTag, energy, setEnergy, allTags, filtered } = useTaskFilters(
    nextTasks,
    "clarity.filters.next"
  );

  return (
    <div>
      <PageHeader
        title="Next actions"
        subtitle="Everything you could do next — drag into your own order; unplaced tasks rank by leverage"
      />

      <FilterChips
        tag={tag}
        setTag={setTag}
        energy={energy}
        setEnergy={setEnergy}
        allTags={allTags}
        showEnergy={nextTasks.some((t) => t.energy)}
      />

      <TaskList
        tasks={filtered}
        // Reordering a filtered subset would scramble hidden rows.
        reorderable={!tag && !energy}
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
