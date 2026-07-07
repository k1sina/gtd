"use client";

import { Hourglass } from "lucide-react";
import { useMemo } from "react";
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

  return (
    <div>
      <PageHeader
        title="Waiting for"
        subtitle="Delegated or blocked — chase these during your weekly review"
      />
      <TaskList
        tasks={waiting}
        emptyState={
          <EmptyState
            icon={<Hourglass size={22} />}
            title="Not waiting on anyone"
            hint="When you delegate something, clarify it as “Waiting for” to track it here."
          />
        }
      />
    </div>
  );
}
