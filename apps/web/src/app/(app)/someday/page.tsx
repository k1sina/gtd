"use client";

import { byUserOrder } from "@gtd/shared";
import { Moon } from "lucide-react";
import { useMemo } from "react";
import { FilterChips, useTaskFilters } from "@/components/filter-chips";
import { PageHeader, TaskList } from "@/components/task-list";
import { EmptyState } from "@/components/ui";
import { useTasks } from "@/lib/data";
import { useSpace } from "@/lib/space-context";

export default function SomedayPage() {
  const { currentSpace } = useSpace();
  const { data: tasks = [] } = useTasks(currentSpace?.id);

  const someday = useMemo(
    () =>
      tasks
        .filter((t) => t.status === "someday" && !t.parent_task_id)
        .sort(byUserOrder()),
    [tasks]
  );

  const { tag, setTag, energy, setEnergy, allTags, filtered } = useTaskFilters(
    someday,
    "clarity.filters.someday"
  );

  return (
    <div>
      <PageHeader
        title="Someday / maybe"
        subtitle="Ideas you're not committing to yet — reviewed weekly"
      />
      <FilterChips
        tag={tag}
        setTag={setTag}
        energy={energy}
        setEnergy={setEnergy}
        allTags={allTags}
        showEnergy={someday.some((t) => t.energy)}
      />
      <TaskList
        tasks={filtered}
        reorderable={!tag && !energy}
        emptyState={
          <EmptyState
            icon={<Moon size={22} />}
            title={
              someday.length === 0
                ? "No someday items"
                : "Nothing matches the filters"
            }
            hint={
              someday.length === 0
                ? "Park ideas here with !someday when capturing."
                : undefined
            }
          />
        }
      />
    </div>
  );
}
