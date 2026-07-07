"use client";

import { Moon } from "lucide-react";
import { useMemo } from "react";
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
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        ),
    [tasks]
  );

  return (
    <div>
      <PageHeader
        title="Someday / maybe"
        subtitle="Ideas you're not committing to yet — reviewed weekly"
      />
      <TaskList
        tasks={someday}
        emptyState={
          <EmptyState
            icon={<Moon size={22} />}
            title="No someday items"
            hint="Park ideas here with !someday when capturing."
          />
        }
      />
    </div>
  );
}
