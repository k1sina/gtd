import { describe, expect, it } from "vitest";
import {
  firstActionableSubtask,
  hasOpenSubtasks,
  isStalledParent,
  type SubtaskNode,
} from "../src/subtasks";

// Mirrored in Swift: ClarityCore SubtasksTests — keep the tables in sync.

const now = new Date("2026-07-11T12:00:00.000Z");

let seq = 0;
function node(over: Partial<SubtaskNode> & { id: string }): SubtaskNode {
  return {
    parent_task_id: null,
    status: "next",
    sort_order: 0,
    created_at: `2026-07-01T00:00:00.${String(seq++).padStart(3, "0")}Z`,
    defer_until: null,
    urgency: 2,
    importance: 2,
    ...over,
  };
}

describe("hasOpenSubtasks", () => {
  it("ignores done and cancelled children", () => {
    const tasks = [
      node({ id: "p" }),
      node({ id: "a", parent_task_id: "p", status: "done" }),
      node({ id: "b", parent_task_id: "p", status: "cancelled" }),
    ];
    expect(hasOpenSubtasks("p", tasks)).toBe(false);
    tasks.push(node({ id: "c", parent_task_id: "p", status: "waiting" }));
    expect(hasOpenSubtasks("p", tasks)).toBe(true);
  });
});

describe("firstActionableSubtask", () => {
  it("returns the lowest sort_order next child, skipping non-next statuses", () => {
    const tasks = [
      node({ id: "p" }),
      node({ id: "a", parent_task_id: "p", status: "waiting", sort_order: 0 }),
      node({ id: "b", parent_task_id: "p", sort_order: 2 }),
      node({ id: "c", parent_task_id: "p", sort_order: 1 }),
    ];
    expect(firstActionableSubtask("p", tasks, now)?.id).toBe("c");
  });

  it("breaks sort_order ties by created_at", () => {
    const tasks = [
      node({ id: "p" }),
      node({
        id: "later",
        parent_task_id: "p",
        created_at: "2026-07-02T00:00:00.000Z",
      }),
      node({
        id: "earlier",
        parent_task_id: "p",
        created_at: "2026-07-01T00:00:00.000Z",
      }),
    ];
    expect(firstActionableSubtask("p", tasks, now)?.id).toBe("earlier");
  });

  it("skips deferred children", () => {
    const tasks = [
      node({ id: "p" }),
      node({
        id: "a",
        parent_task_id: "p",
        sort_order: 0,
        defer_until: "2026-08-01T00:00:00.000Z",
      }),
      node({ id: "b", parent_task_id: "p", sort_order: 1 }),
    ];
    expect(firstActionableSubtask("p", tasks, now)?.id).toBe("b");
  });

  it("recurses into a child with open children (depth 2)", () => {
    const tasks = [
      node({ id: "p" }),
      node({ id: "mid", parent_task_id: "p", sort_order: 0 }),
      node({ id: "leaf", parent_task_id: "mid" }),
      node({ id: "sibling", parent_task_id: "p", sort_order: 1 }),
    ];
    expect(firstActionableSubtask("p", tasks, now)?.id).toBe("leaf");
  });

  it("falls back to the mid task itself when its children are all closed", () => {
    const tasks = [
      node({ id: "p" }),
      node({ id: "mid", parent_task_id: "p" }),
      node({ id: "leaf", parent_task_id: "mid", status: "done" }),
    ];
    expect(firstActionableSubtask("p", tasks, now)?.id).toBe("mid");
  });

  it("returns null when nothing is actionable", () => {
    const tasks = [
      node({ id: "p" }),
      node({ id: "a", parent_task_id: "p", status: "waiting" }),
      node({ id: "b", parent_task_id: "p", status: "someday" }),
    ];
    expect(firstActionableSubtask("p", tasks, now)).toBeNull();
  });
});

describe("isStalledParent", () => {
  const stalledChildren = (pid: string) => [
    node({ id: `${pid}-w`, parent_task_id: pid, status: "waiting" }),
  ];

  it("flags a live parent whose open subtasks have no next action", () => {
    const p = node({ id: "p" });
    expect(isStalledParent(p, [p, ...stalledChildren("p")], now)).toBe(true);
  });

  it("does not flag when an actionable subtask exists", () => {
    const p = node({ id: "p" });
    const tasks = [p, ...stalledChildren("p"), node({ id: "n", parent_task_id: "p" })];
    expect(isStalledParent(p, tasks, now)).toBe(false);
  });

  it("a parent whose only next subtask is deferred counts as stalled", () => {
    const p = node({ id: "p" });
    const tasks = [
      p,
      node({
        id: "d",
        parent_task_id: "p",
        defer_until: "2026-08-01T00:00:00.000Z",
      }),
    ];
    expect(isStalledParent(p, tasks, now)).toBe(true);
  });

  it("never flags someday, done, or cancelled parents", () => {
    for (const status of ["someday", "done", "cancelled"] as const) {
      const p = node({ id: "p", status });
      expect(isStalledParent(p, [p, ...stalledChildren("p")], now)).toBe(false);
    }
  });

  it("never flags a task without open subtasks", () => {
    const p = node({ id: "p" });
    expect(isStalledParent(p, [p], now)).toBe(false);
    const done = node({ id: "x", parent_task_id: "p", status: "done" });
    expect(isStalledParent(p, [p, done], now)).toBe(false);
  });
});
