import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLANNER_CONFIG,
  freeSlots,
  mergeIntervals,
  planDay,
  type PlannableTask,
} from "../src/timeblock";

const day = new Date("2026-07-08T00:00:00"); // Wednesday
const earlyMorning = new Date("2026-07-08T06:00:00");

const t = (hhmm: string) => new Date(`2026-07-08T${hhmm}:00`);

function task(
  id: string,
  overrides: Partial<PlannableTask> = {}
): PlannableTask {
  return { id, title: id, urgency: 2, importance: 2, ...overrides };
}

describe("mergeIntervals", () => {
  it("merges overlapping and keeps disjoint", () => {
    const merged = mergeIntervals([
      { start: t("10:00"), end: t("11:00") },
      { start: t("10:30"), end: t("11:30") },
      { start: t("13:00"), end: t("14:00") },
    ]);
    expect(merged).toEqual([
      { start: t("10:00"), end: t("11:30") },
      { start: t("13:00"), end: t("14:00") },
    ]);
  });
});

describe("freeSlots", () => {
  it("returns the gaps around busy intervals", () => {
    const slots = freeSlots(
      { start: t("09:00"), end: t("17:00") },
      [
        { start: t("10:00"), end: t("11:00") },
        { start: t("12:00"), end: t("13:00") },
      ]
    );
    expect(slots).toEqual([
      { start: t("09:00"), end: t("10:00") },
      { start: t("11:00"), end: t("12:00") },
      { start: t("13:00"), end: t("17:00") },
    ]);
  });

  it("clips busy intervals extending past the window", () => {
    const slots = freeSlots(
      { start: t("09:00"), end: t("17:00") },
      [{ start: t("08:00"), end: t("09:30") }]
    );
    expect(slots).toEqual([{ start: t("09:30"), end: t("17:00") }]);
  });
});

describe("planDay", () => {
  it("places the highest-priority task first", () => {
    const blocks = planDay(
      [
        task("low", { urgency: 1, importance: 1, estimated_minutes: 30 }),
        task("high", { urgency: 4, importance: 4, estimated_minutes: 30 }),
      ],
      [],
      day,
      DEFAULT_PLANNER_CONFIG,
      earlyMorning
    );
    expect(blocks[0]!.taskId).toBe("high");
    expect(blocks[0]!.start).toEqual(t("09:00"));
    expect(blocks[0]!.end).toEqual(t("09:30"));
    // buffer of 10m before the next block
    expect(blocks[1]!.start).toEqual(t("09:40"));
  });

  it("skips over meetings", () => {
    const blocks = planDay(
      [task("a", { estimated_minutes: 60 })],
      [{ start: t("09:00"), end: t("10:30") }],
      day,
      DEFAULT_PLANNER_CONFIG,
      earlyMorning
    );
    expect(blocks[0]!.start).toEqual(t("10:30"));
  });

  it("never plans in the past", () => {
    const blocks = planDay(
      [task("a", { estimated_minutes: 30 })],
      [],
      day,
      DEFAULT_PLANNER_CONFIG,
      t("14:00")
    );
    expect(blocks[0]!.start).toEqual(t("14:00"));
  });

  it("returns nothing after the workday", () => {
    expect(
      planDay([task("a")], [], day, DEFAULT_PLANNER_CONFIG, t("18:00"))
    ).toEqual([]);
  });

  it("caps long estimates and skips tasks that don't fit", () => {
    const blocks = planDay(
      [
        task("huge", { estimated_minutes: 600, urgency: 4, importance: 4 }),
        task("smaller", { estimated_minutes: 240 }),
      ],
      [{ start: t("09:00"), end: t("14:00") }],
      day,
      DEFAULT_PLANNER_CONFIG,
      earlyMorning
    );
    // 14:00-17:00 window: huge capped to 120m fits; smaller capped to 120m
    // no longer fits after buffer (14:00+120=16:00, +10m=16:10, needs 120m).
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.taskId).toBe("huge");
    expect(blocks[0]!.end).toEqual(t("16:00"));
  });

  it("respects maxBlocks", () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      task(`t${i}`, { estimated_minutes: 15 })
    );
    const blocks = planDay(many, [], day, DEFAULT_PLANNER_CONFIG, earlyMorning);
    expect(blocks).toHaveLength(DEFAULT_PLANNER_CONFIG.maxBlocks);
  });
});
