"use client";

import clsx from "clsx";
import { Flame, Plus, RefreshCcw, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { habitDueOn, habitStreak } from "@/components/habit-strip";
import { PageHeader } from "@/components/task-list";
import { Button, Dialog, EmptyState, Input } from "@/components/ui";
import {
  useArchiveHabit,
  useCreateHabit,
  useHabitLogs,
  useHabits,
  useToggleHabitLog,
} from "@/lib/data";
import { addDays, isoWeekday, startOfDay, toDateKey } from "@/lib/format";
import { useSpace } from "@/lib/space-context";

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

export default function HabitsPage() {
  const { currentSpace } = useSpace();
  const { data: habits = [] } = useHabits(currentSpace?.id);
  const createHabit = useCreateHabit();
  const archiveHabit = useArchiveHabit();
  const toggle = useToggleHabitLog();

  const today = useMemo(() => startOfDay(new Date()), []);
  const since = toDateKey(addDays(today, -366));
  const { data: logs = [] } = useHabitLogs(since);

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [weekdays, setWeekdays] = useState<number[]>([]);

  // Current week, Monday..Sunday.
  const weekDays = useMemo(() => {
    const monday = addDays(today, -isoWeekday(today));
    return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  }, [today]);

  const logSet = useMemo(
    () => new Set(logs.map((l) => `${l.habit_id}:${l.log_date}`)),
    [logs]
  );

  async function submit() {
    if (!currentSpace || !name.trim()) return;
    await createHabit.mutateAsync({
      space_id: currentSpace.id,
      name: name.trim(),
      weekdays,
    });
    setCreating(false);
    setName("");
    setWeekdays([]);
  }

  return (
    <div>
      <PageHeader
        title="Habits"
        subtitle="Small recurring wins — check them off daily"
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus size={15} /> New habit
          </Button>
        }
      />

      {habits.length === 0 ? (
        <EmptyState
          icon={<RefreshCcw size={22} />}
          title="No habits yet"
          hint="Track things like exercise, reading, or a shutdown ritual."
          action={
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus size={15} /> Create a habit
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-ink-faint">
                <th className="px-4 py-2.5 text-left font-medium">Habit</th>
                {weekDays.map((d, i) => (
                  <th
                    key={i}
                    className={clsx(
                      "w-10 py-2.5 text-center font-medium",
                      toDateKey(d) === toDateKey(today) && "text-accent"
                    )}
                  >
                    {DAY_LABELS[i]}
                    <span className="block text-[10px] font-normal">
                      {d.getDate()}
                    </span>
                  </th>
                ))}
                <th className="w-16 py-2.5 text-center font-medium">Streak</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {habits.map((habit) => {
                const streak = habitStreak(habit, logs, new Date());
                return (
                  <tr key={habit.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-2.5 font-medium">{habit.name}</td>
                    {weekDays.map((d, i) => {
                      const scheduled = habitDueOn(habit, d);
                      const key = toDateKey(d);
                      const done = logSet.has(`${habit.id}:${key}`);
                      const future = d > today;
                      return (
                        <td key={i} className="py-2.5 text-center">
                          {scheduled ? (
                            <button
                              disabled={future}
                              onClick={() =>
                                toggle.mutate({
                                  habitId: habit.id,
                                  date: d,
                                  done: !done,
                                })
                              }
                              className={clsx(
                                "mx-auto flex h-6 w-6 items-center justify-center rounded-full border transition-colors",
                                done
                                  ? "border-emerald-500 bg-emerald-500 text-white"
                                  : future
                                    ? "border-line"
                                    : "border-ink-faint hover:border-emerald-500 cursor-pointer"
                              )}
                            >
                              {done && (
                                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                  <path
                                    d="M1.5 5.5L4 8L8.5 2.5"
                                    stroke="currentColor"
                                    strokeWidth="1.8"
                                    strokeLinecap="round"
                                  />
                                </svg>
                              )}
                            </button>
                          ) : (
                            <span className="text-ink-faint">·</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="py-2.5 text-center">
                      {streak > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-amber-600">
                          <Flame size={12} />
                          {streak}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-2 text-center">
                      <button
                        title="Archive habit"
                        onClick={() => archiveHabit.mutate(habit.id)}
                        className="rounded p-1 text-ink-faint hover:bg-canvas hover:text-red-600 cursor-pointer"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={creating} onClose={() => setCreating(false)} title="New habit">
        <div className="flex flex-col gap-3 p-4">
          <Input
            autoFocus
            placeholder="Habit name (e.g. Morning run)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
          <div>
            <p className="mb-1.5 text-xs text-ink-soft">
              Which days? (none selected = every day)
            </p>
            <div className="flex gap-1">
              {DAY_LABELS.map((label, i) => (
                <button
                  key={i}
                  onClick={() =>
                    setWeekdays((w) =>
                      w.includes(i) ? w.filter((d) => d !== i) : [...w, i].sort()
                    )
                  }
                  className={clsx(
                    "h-8 w-8 rounded-full border text-xs font-medium cursor-pointer",
                    weekdays.includes(i)
                      ? "border-accent bg-accent text-white"
                      : "border-line text-ink-soft hover:border-accent"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-4 py-2.5">
          <Button onClick={() => setCreating(false)}>Cancel</Button>
          <Button variant="primary" disabled={!name.trim()} onClick={submit}>
            Create habit
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
