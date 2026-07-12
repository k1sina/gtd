import type { Habit, HabitLog } from "@gtd/shared";
import { addDays, isoWeekday, toDateKey } from "./format";

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
