"use client";

import { CalendarClock } from "lucide-react";
import { useMemo } from "react";
import { PageHeader, TaskList } from "@/components/task-list";
import { EmptyState } from "@/components/ui";
import { useTasks } from "@/lib/data";
import { addDays, startOfDay } from "@/lib/format";
import { useSpace } from "@/lib/space-context";

export default function ScheduledPage() {
  const { currentSpace } = useSpace();
  const { data: tasks = [] } = useTasks(currentSpace?.id);

  const now = new Date();
  const groups = useMemo(() => {
    const open = tasks
      .filter(
        (t) =>
          !t.parent_task_id &&
          !["done", "cancelled"].includes(t.status) &&
          (t.due_at || t.defer_until)
      )
      .sort(
        (a, b) =>
          new Date(a.due_at ?? a.defer_until!).getTime() -
          new Date(b.due_at ?? b.defer_until!).getTime()
      );

    const today = startOfDay(now);
    const tomorrow = addDays(today, 1);
    const nextWeek = addDays(today, 7);

    const at = (t: (typeof open)[number]) => new Date(t.due_at ?? t.defer_until!);
    return {
      overdue: open.filter((t) => at(t) < today),
      today: open.filter((t) => at(t) >= today && at(t) < tomorrow),
      week: open.filter((t) => at(t) >= tomorrow && at(t) < nextWeek),
      later: open.filter((t) => at(t) >= nextWeek),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks]);

  const sections: [string, typeof groups.today][] = [
    ["Overdue", groups.overdue],
    ["Today", groups.today],
    ["Next 7 days", groups.week],
    ["Later", groups.later],
  ];

  const empty = sections.every(([, list]) => list.length === 0);

  return (
    <div>
      <PageHeader
        title="Scheduled"
        subtitle="Date-bound tasks and deferred items"
      />
      {empty ? (
        <EmptyState
          icon={<CalendarClock size={22} />}
          title="Nothing scheduled"
          hint='Add a date while capturing ("friday", "in 2 weeks") or in the task editor.'
        />
      ) : (
        sections.map(
          ([label, list]) =>
            list.length > 0 && (
              <section key={label} className="mb-6">
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">
                  {label} · {list.length}
                </h2>
                <TaskList tasks={list} />
              </section>
            )
        )
      )}
    </div>
  );
}
