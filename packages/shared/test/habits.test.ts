import { describe, expect, it } from "vitest";
import { habitDueOn, habitStreak, habitSummary } from "../src/habits";
import type { Habit, HabitLog } from "../src/types";

// 2026-07-07 is a Tuesday (isoWeekday 1).
const tuesday = new Date(2026, 6, 7, 10, 0);

function habit(patch: Partial<Habit> = {}): Habit {
  return {
    id: "h1",
    space_id: "s1",
    created_by: "u1",
    name: "Morning pages",
    weekdays: [],
    sort_order: 0,
    archived_at: null,
    created_at: "2026-01-01T00:00:00Z",
    ...patch,
  };
}

function logs(...dates: string[]): HabitLog[] {
  return dates.map((log_date) => ({
    habit_id: "h1",
    user_id: "u1",
    log_date,
    created_at: "2026-01-01T00:00:00Z",
  }));
}

describe("habitDueOn", () => {
  it("treats an empty weekday list as every day", () => {
    expect(habitDueOn(habit(), tuesday)).toBe(true);
    expect(habitDueOn(habit(), new Date(2026, 6, 12))).toBe(true); // Sunday
  });

  it("honours the Monday-is-zero weekday numbering", () => {
    expect(habitDueOn(habit({ weekdays: [1] }), tuesday)).toBe(true);
    expect(habitDueOn(habit({ weekdays: [0, 2] }), tuesday)).toBe(false);
    // 6 = Sunday.
    expect(habitDueOn(habit({ weekdays: [6] }), new Date(2026, 6, 12))).toBe(true);
  });
});

describe("habitStreak", () => {
  it("counts consecutive logged days back from today", () => {
    expect(
      habitStreak(habit(), logs("2026-07-07", "2026-07-06", "2026-07-05"), tuesday)
    ).toBe(3);
  });

  it("does not break the streak on a today that is still open", () => {
    expect(habitStreak(habit(), logs("2026-07-06", "2026-07-05"), tuesday)).toBe(2);
  });

  it("breaks on the first missed scheduled day", () => {
    expect(habitStreak(habit(), logs("2026-07-07", "2026-07-05"), tuesday)).toBe(1);
  });

  it("skips days the habit is not scheduled for", () => {
    // Mondays and Tuesdays only: the weekend in between is not a miss.
    const weekly = habit({ weekdays: [0, 1] });
    const streak = habitStreak(
      weekly,
      logs("2026-07-07", "2026-07-06", "2026-06-30", "2026-06-29"),
      tuesday
    );
    expect(streak).toBe(4);
  });

  it("ignores logs belonging to another habit", () => {
    const other: HabitLog[] = [
      { habit_id: "h2", user_id: "u1", log_date: "2026-07-07", created_at: "" },
    ];
    expect(habitStreak(habit(), other, tuesday)).toBe(0);
  });
});

describe("habitSummary", () => {
  it("reports the schedule, today's state and the streak", () => {
    const summary = habitSummary(
      habit(),
      logs("2026-07-07", "2026-07-06"),
      tuesday
    );
    expect(summary.every_day).toBe(true);
    expect(summary.due_today).toBe(true);
    expect(summary.done_today).toBe(true);
    expect(summary.streak).toBe(2);
    expect(summary.archived).toBe(false);
  });

  it("lists recent days newest first, marked due and done", () => {
    const summary = habitSummary(
      habit({ weekdays: [0, 1] }),
      logs("2026-07-06"),
      tuesday,
      3
    );
    expect(summary.recent).toEqual([
      { date: "2026-07-07", due: true, done: false },
      { date: "2026-07-06", due: true, done: true },
      { date: "2026-07-05", due: false, done: false },
    ]);
  });

  it("marks an archived habit", () => {
    expect(
      habitSummary(habit({ archived_at: "2026-07-01T00:00:00Z" }), [], tuesday)
        .archived
    ).toBe(true);
  });
});
