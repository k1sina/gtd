"use client";

import { byPriority, isDeferred } from "@gtd/shared";
import { Sun } from "lucide-react";
import { useMemo } from "react";
import { DayPlanner } from "@/components/day-planner";
import { HabitStrip } from "@/components/habit-strip";
import { PageHeader, TaskList } from "@/components/task-list";
import { EmptyState } from "@/components/ui";
import { useTasks } from "@/lib/data";
import { startOfDay, addDays } from "@/lib/format";
import { useSpace } from "@/lib/space-context";

export default function TodayPage() {
  const { currentSpace } = useSpace();
  const { data: tasks = [] } = useTasks(currentSpace?.id);

  const now = new Date();
  const endOfToday = addDays(startOfDay(now), 1);

  const { dueTasks, topPicks, doneToday } = useMemo(() => {
    const open = tasks.filter(
      (t) =>
        !t.parent_task_id &&
        !["done", "cancelled", "someday", "inbox"].includes(t.status) &&
        !isDeferred(t, now)
    );
    const due = open
      .filter((t) => t.due_at && new Date(t.due_at) < endOfToday)
      .sort(byPriority(now));
    const dueIds = new Set(due.map((t) => t.id));
    const picks = open
      .filter((t) => t.status === "next" && !dueIds.has(t.id))
      .sort(byPriority(now))
      .slice(0, 5);
    const done = tasks.filter(
      (t) =>
        !t.parent_task_id &&
        t.status === "done" &&
        t.completed_at &&
        new Date(t.completed_at) >= startOfDay(now)
    );
    return { dueTasks: due, topPicks: picks, doneToday: done };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks]);

  return (
    <div>
      <PageHeader
        title="Today"
        subtitle={now.toLocaleDateString([], {
          weekday: "long",
          month: "long",
          day: "numeric",
        })}
      />

      <HabitStrip />
      <DayPlanner />

      {dueTasks.length === 0 && topPicks.length === 0 && (
        <EmptyState
          icon={<Sun size={22} />}
          title="Nothing scheduled for today"
          hint="Capture something with N, or pick next actions in the Next list."
        />
      )}

      {dueTasks.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">
            Due &amp; overdue
          </h2>
          <TaskList tasks={dueTasks} />
        </section>
      )}

      {topPicks.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">
            Top priorities
          </h2>
          <TaskList tasks={topPicks} />
        </section>
      )}

      {doneToday.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">
            Completed today · {doneToday.length}
          </h2>
          <TaskList tasks={doneToday} />
        </section>
      )}
    </div>
  );
}
