import { describe, expect, it } from "vitest";
import { buildUpdatePatch, filterAndRankTasks } from "../src/tools";

const now = new Date("2026-07-07T10:00:00");

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "t1",
    title: "Task",
    status: "next",
    urgency: 2,
    importance: 2,
    due_at: null,
    defer_until: null,
    estimated_minutes: null,
    context_tags: [],
    waiting_on: null,
    recurrence_rule: null,
    project_id: null,
    parent_task_id: null,
    notes: null,
    ...overrides,
  };
}

describe("buildUpdatePatch", () => {
  it("whitelists fields and ignores unknown keys", () => {
    const patch = buildUpdatePatch({
      task_id: "x",
      title: "New",
      urgency: 4,
      evil_field: "nope",
    });
    expect(patch).toEqual({ title: "New", urgency: 4 });
  });

  it("clears dates on empty string, passes them through otherwise", () => {
    expect(buildUpdatePatch({ due_at: "" })).toEqual({ due_at: null });
    expect(buildUpdatePatch({ due_at: "2026-07-08T15:00:00Z" })).toEqual({
      due_at: "2026-07-08T15:00:00Z",
    });
    expect(buildUpdatePatch({})).toEqual({});
  });
});

describe("filterAndRankTasks", () => {
  it("drops sub-tasks and ranks by priority", () => {
    const rows = [
      row({ id: "low", urgency: 1, importance: 1 }),
      row({ id: "sub", parent_task_id: "low" }),
      row({ id: "high", urgency: 4, importance: 4 }),
    ];
    const out = filterAndRankTasks(rows, {}, now);
    expect(out.map((t) => t.id)).toEqual(["high", "low"]);
    expect(out[0].quadrant).toBe("do");
  });

  it("applies due_within_days including overdue", () => {
    const rows = [
      row({ id: "overdue", due_at: "2026-07-01T10:00:00Z" }),
      row({ id: "nextweek", due_at: "2026-07-20T10:00:00Z" }),
      row({ id: "nodate" }),
    ];
    const out = filterAndRankTasks(rows, { due_within_days: 3 }, now);
    expect(out.map((t) => t.id)).toEqual(["overdue"]);
  });

  it("marks deferred tasks", () => {
    const rows = [row({ id: "later", defer_until: "2026-08-01T10:00:00Z" })];
    const out = filterAndRankTasks(rows, {}, now);
    expect(out[0].deferred).toBe(true);
  });
});
