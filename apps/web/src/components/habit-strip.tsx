"use client";

import type { Habit, HabitLog } from "@gtd/shared";
import clsx from "clsx";
import { Flame } from "lucide-react";
import { useMemo } from "react";
import { useHabitLogs, useHabits, useToggleHabitLog } from "@/lib/data";
import { addDays, isoWeekday, toDateKey } from "@/lib/format";
import { useSpace } from "@/lib/space-context";

export function habitDueOn(habit: Habit, date: Date): boolean {
  return habit.weekdays.length === 0 || habit.weekdays.includes(isoWeekday(date));
}

/** Consecutive scheduled days (ending today or yesterday) with a log. */
export function habitStreak(habit: Habit, logs: HabitLog[], today: Date): number {
  const logSet = new Set(
    logs.filter((l) => l.habit_id === habit.id).map((l) => l.log_date)
  );
  let streak = 0;
  let day = new Date(today);
  // A missed *today* doesn't break the streak until the day is over.
  if (habitDueOn(habit, day) && logSet.has(toDateKey(day))) streak += 1;
  day = addDays(day, -1);
  for (let i = 0; i < 365; i++, day = addDays(day, -1)) {
    if (!habitDueOn(habit, day)) continue;
    if (logSet.has(toDateKey(day))) streak += 1;
    else break;
  }
  return streak;
}

/** Compact "today's habits" checklist used on the Today page. */
export function HabitStrip() {
  const { currentSpace } = useSpace();
  const { data: habits = [] } = useHabits(currentSpace?.id);
  const today = useMemo(() => new Date(), []);
  const since = toDateKey(addDays(today, -366));
  const { data: logs = [] } = useHabitLogs(since);
  const toggle = useToggleHabitLog();

  const todayKey = toDateKey(today);
  const dueToday = habits.filter((h) => habitDueOn(h, today));
  if (dueToday.length === 0) return null;

  return (
    <div className="mb-6 flex flex-wrap gap-2">
      {dueToday.map((habit) => {
        const done = logs.some(
          (l) => l.habit_id === habit.id && l.log_date === todayKey
        );
        const streak = habitStreak(habit, logs, today);
        return (
          <button
            key={habit.id}
            onClick={() => toggle.mutate({ habitId: habit.id, date: today, done: !done })}
            className={clsx(
              "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
              done
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-line bg-surface text-ink-soft hover:border-accent hover:text-accent"
            )}
          >
            <span
              className={clsx(
                "flex h-3.5 w-3.5 items-center justify-center rounded-full border",
                done ? "border-emerald-500 bg-emerald-500 text-white" : "border-ink-faint"
              )}
            >
              {done && (
                <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                  <path
                    d="M1.5 5.5L4 8L8.5 2.5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              )}
            </span>
            {habit.name}
            {streak > 1 && (
              <span className="flex items-center gap-0.5 text-[10px] text-amber-600">
                <Flame size={10} />
                {streak}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
