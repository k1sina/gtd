"use client";

import { Inbox } from "lucide-react";
import { useMemo, useState } from "react";
import { ClarifyCard } from "@/components/clarify";
import { PageHeader, TaskList } from "@/components/task-list";
import { Button, EmptyState } from "@/components/ui";
import { useTasks } from "@/lib/data";
import { useSpace } from "@/lib/space-context";

export default function InboxPage() {
  const { currentSpace } = useSpace();
  const { data: tasks = [] } = useTasks(currentSpace?.id);
  const [clarifying, setClarifying] = useState(false);

  const inbox = useMemo(
    () =>
      tasks
        .filter((t) => t.status === "inbox" && !t.parent_task_id)
        .sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        ),
    [tasks]
  );

  const current = inbox[0];

  return (
    <div>
      <PageHeader
        title="Inbox"
        subtitle={
          inbox.length > 0
            ? `${inbox.length} item${inbox.length === 1 ? "" : "s"} to clarify`
            : "Everything clarified — inbox zero"
        }
        actions={
          inbox.length > 0 && (
            <Button
              variant={clarifying ? "default" : "primary"}
              onClick={() => setClarifying((v) => !v)}
            >
              {clarifying ? "Back to list" : "Clarify items"}
            </Button>
          )
        }
      />

      {inbox.length === 0 ? (
        <EmptyState
          icon={<Inbox size={22} />}
          title="Inbox zero"
          hint="Press N anywhere to capture what's on your mind — clarify it here later."
        />
      ) : clarifying && current ? (
        <ClarifyCard task={current} />
      ) : (
        <TaskList tasks={inbox} />
      )}
    </div>
  );
}
