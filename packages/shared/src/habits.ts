// Habit scheduling: which days a habit is due on, how long the streak is, and
// the shape the assistant / MCP tools report a habit in.
//
// Weekday numbering is the app-wide one: 0 = Monday … 6 = Sunday, and an
// empty `weekdays` means every day. Mirrored in
// apps/apple/ClarityCore/Sources/ClarityCore/Periods.swift (habitStreak) and
// Models.swift (Habit.isDue).

import type { Habit, HabitLog } from "./types";

// Local civil-date helpers, as in recurrence.ts — a log date is a day on the
// calendar, not an instant.
function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

/** 0 = Monday … 6 = Sunday. */
function isoWeekday(d: Date): number {
  return (d.getDay() + 6) % 7;
}

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function habitDueOn(habit: Habit, date: Date): boolean {
  return habit.weekdays.length === 0 || habit.weekdays.includes(isoWeekday(date));
}

/** Consecutive scheduled days (ending today or yesterday) with a log. */
export function habitStreak(
  habit: Habit,
  logs: HabitLog[],
  today: Date
): number {
  const logged = new Set(
    logs.filter((l) => l.habit_id === habit.id).map((l) => l.log_date)
  );
  let streak = 0;
  let day = new Date(today);
  // A missed *today* doesn't break the streak until the day is over.
  if (habitDueOn(habit, day) && logged.has(dateKey(day))) streak += 1;
  day = addDays(day, -1);
  for (let i = 0; i < 365; i++, day = addDays(day, -1)) {
    if (!habitDueOn(habit, day)) continue;
    if (logged.has(dateKey(day))) streak += 1;
    else break;
  }
  return streak;
}

export interface HabitDay {
  /** YYYY-MM-DD */
  date: string;
  due: boolean;
  done: boolean;
}

export interface HabitSummary {
  id: string;
  name: string;
  /** 0 = Monday … 6 = Sunday; empty when the habit is due every day. */
  weekdays: number[];
  every_day: boolean;
  due_today: boolean;
  done_today: boolean;
  streak: number;
  archived: boolean;
  /** Most recent day first, so "did I miss yesterday?" reads off the top. */
  recent: HabitDay[];
}

/** One habit as the assistant should see it: schedule, streak, recent days. */
export function habitSummary(
  habit: Habit,
  logs: HabitLog[],
  now: Date = new Date(),
  days = 7
): HabitSummary {
  const today = startOfDay(now);
  const logged = new Set(
    logs.filter((l) => l.habit_id === habit.id).map((l) => l.log_date)
  );
  const recent: HabitDay[] = [];
  for (let i = 0; i < Math.max(1, days); i++) {
    const day = addDays(today, -i);
    recent.push({
      date: dateKey(day),
      due: habitDueOn(habit, day),
      done: logged.has(dateKey(day)),
    });
  }
  return {
    id: habit.id,
    name: habit.name,
    weekdays: habit.weekdays,
    every_day: habit.weekdays.length === 0,
    due_today: habitDueOn(habit, today),
    done_today: logged.has(dateKey(today)),
    streak: habitStreak(habit, logs, today),
    archived: habit.archived_at != null,
    recent,
  };
}
