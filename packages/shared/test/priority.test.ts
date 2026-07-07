import { describe, expect, it } from "vitest";
import { byPriority, isDeferred, priorityScore, quadrant } from "../src/priority";

describe("quadrant", () => {
  it("maps the four Eisenhower quadrants", () => {
    expect(quadrant(4, 4)).toBe("do");
    expect(quadrant(1, 4)).toBe("schedule");
    expect(quadrant(4, 1)).toBe("delegate");
    expect(quadrant(1, 1)).toBe("eliminate");
  });

  it("treats 3 as the high threshold", () => {
    expect(quadrant(3, 3)).toBe("do");
    expect(quadrant(2, 3)).toBe("schedule");
    expect(quadrant(3, 2)).toBe("delegate");
    expect(quadrant(2, 2)).toBe("eliminate");
  });
});

describe("priorityScore", () => {
  const now = new Date("2026-07-07T12:00:00");

  it("weights importance above urgency", () => {
    const important = priorityScore({ urgency: 1, importance: 4 }, now);
    const urgent = priorityScore({ urgency: 4, importance: 1 }, now);
    expect(important).toBeGreaterThan(urgent);
  });

  it("boosts overdue tasks the most", () => {
    const base = { urgency: 2, importance: 2 };
    const overdue = priorityScore({ ...base, due_at: "2026-07-01T12:00:00" }, now);
    const today = priorityScore({ ...base, due_at: "2026-07-07T18:00:00" }, now);
    const nextWeek = priorityScore({ ...base, due_at: "2026-07-20T12:00:00" }, now);
    expect(overdue).toBeGreaterThan(today);
    expect(today).toBeGreaterThan(nextWeek);
  });

  it("sorts descending via byPriority", () => {
    const tasks = [
      { urgency: 1, importance: 1 },
      { urgency: 4, importance: 4 },
      { urgency: 2, importance: 3 },
    ];
    const sorted = [...tasks].sort(byPriority(now));
    expect(sorted[0]).toEqual({ urgency: 4, importance: 4 });
    expect(sorted[2]).toEqual({ urgency: 1, importance: 1 });
  });
});

describe("isDeferred", () => {
  const now = new Date("2026-07-07T12:00:00");
  it("hides tasks deferred into the future", () => {
    expect(isDeferred({ urgency: 1, importance: 1, defer_until: "2026-08-01" }, now)).toBe(true);
    expect(isDeferred({ urgency: 1, importance: 1, defer_until: "2026-07-01" }, now)).toBe(false);
    expect(isDeferred({ urgency: 1, importance: 1 }, now)).toBe(false);
  });
});
