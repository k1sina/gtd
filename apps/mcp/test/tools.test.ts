import { describe, expect, it } from "vitest";
import { buildUpdatePatch, filterAndRankTasks } from "../src/tools";

const now = new Date("2026-07-07T10:00:00");

let seq = 0;
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
    energy: null,
    context_tags: [],
    waiting_on: null,
    recurrence_rule: null,
    outcome: null,
    parent_task_id: null,
    sort_order: 0,
    created_at: `2026-07-01T00:00:00.${String(seq++).padStart(3, "0")}Z`,
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

  it("clears dates and parent on empty string, passes them through otherwise", () => {
    expect(buildUpdatePatch({ due_at: "" })).toEqual({ due_at: null });
    expect(buildUpdatePatch({ due_at: "2026-07-08T15:00:00Z" })).toEqual({
      due_at: "2026-07-08T15:00:00Z",
    });
    expect(buildUpdatePatch({ parent_task_id: "" })).toEqual({ parent_task_id: null });
    expect(buildUpdatePatch({ parent_task_id: "p1" })).toEqual({
      parent_task_id: "p1",
    });
    expect(buildUpdatePatch({ outcome: "Done means done" })).toEqual({
      outcome: "Done means done",
    });
    expect(buildUpdatePatch({})).toEqual({});
  });

  it("passes sort_order through for manual reordering", () => {
    expect(buildUpdatePatch({ sort_order: 2.5 })).toEqual({ sort_order: 2.5 });
  });

  it("passes energy and context_tags through", () => {
    expect(buildUpdatePatch({ energy: "low", context_tags: ["home"] })).toEqual({
      energy: "low",
      context_tags: ["home"],
    });
  });
});

describe("filterAndRankTasks", () => {
  it("drops sub-tasks from the top-level view and ranks by priority", () => {
    const rows = [
      row({ id: "low", urgency: 1, importance: 1 }),
      row({ id: "sub", parent_task_id: "low" }),
      row({ id: "high", urgency: 4, importance: 4 }),
    ];
    const out = filterAndRankTasks(rows, {}, now);
    expect(out.map((t) => t.id)).toEqual(["high", "low"]);
    expect(out[0].quadrant).toBe("do");
  });

  it("lists a task's subtasks when parent_task_id is given", () => {
    const rows = [
      row({ id: "p" }),
      row({ id: "a", parent_task_id: "p" }),
      row({ id: "b", parent_task_id: "other" }),
    ];
    const out = filterAndRankTasks(rows, { parent_task_id: "p" }, now);
    expect(out.map((t) => t.id)).toEqual(["a"]);
  });

  it("filters by context_tag and energy", () => {
    const rows = [
      row({ id: "home-low", context_tags: ["home"], energy: "low" }),
      row({ id: "home-high", context_tags: ["home"], energy: "high" }),
      row({ id: "office", context_tags: ["office"], energy: "low" }),
      row({ id: "untagged" }),
    ];
    expect(
      filterAndRankTasks(rows, { context_tag: "home" }, now).map((t) => t.id)
    ).toEqual(expect.arrayContaining(["home-low", "home-high"]));
    const out = filterAndRankTasks(
      rows,
      { context_tag: "home", energy: "low" },
      now
    );
    expect(out.map((t) => t.id)).toEqual(["home-low"]);
    expect(out[0]!.energy).toBe("low");
  });

  it("orders subtask listings by sort_order (the surfacing order), not priority", () => {
    const rows = [
      row({ id: "p" }),
      row({ id: "second", parent_task_id: "p", sort_order: 2, urgency: 4, importance: 4 }),
      row({ id: "first", parent_task_id: "p", sort_order: 1 }),
    ];
    const out = filterAndRankTasks(rows, { parent_task_id: "p" }, now);
    expect(out.map((t) => t.id)).toEqual(["first", "second"]);
    expect(out.map((t) => t.sort_order)).toEqual([1, 2]);
  });

  it("flags has_subtasks and stalled parents", () => {
    const rows = [
      row({ id: "moving" }),
      row({ id: "m1", parent_task_id: "moving", status: "next" }),
      row({ id: "stuck" }),
      row({ id: "s1", parent_task_id: "stuck", status: "waiting" }),
      row({ id: "plain" }),
    ];
    const out = filterAndRankTasks(rows, {}, now);
    const byId = new Map(out.map((t) => [t.id, t]));
    expect(byId.get("moving")).toMatchObject({ has_subtasks: true, stalled: false });
    expect(byId.get("stuck")).toMatchObject({ has_subtasks: true, stalled: true });
    expect(byId.get("plain")).toMatchObject({ has_subtasks: false, stalled: false });
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
