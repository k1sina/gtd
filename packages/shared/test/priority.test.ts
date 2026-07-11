import { describe, expect, it } from "vitest";
import {
  byPriority,
  fractionFromGridValue,
  gridValueFromFraction,
  isDeferred,
  priorityScore,
  quadrant,
} from "../src/priority";

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

describe("priority grid", () => {
  it("maps corners to the extreme cells", () => {
    expect(gridValueFromFraction(0, 0)).toEqual({ urgency: 1, importance: 4 });
    expect(gridValueFromFraction(0.999, 0)).toEqual({ urgency: 4, importance: 4 });
    expect(gridValueFromFraction(0, 0.999)).toEqual({ urgency: 1, importance: 1 });
    expect(gridValueFromFraction(0.999, 0.999)).toEqual({ urgency: 4, importance: 1 });
  });

  it("lands dead-center clicks in the Do quadrant", () => {
    expect(gridValueFromFraction(0.5, 0.5)).toEqual({ urgency: 3, importance: 3 });
  });

  it("puts boundary fractions into the upper cell", () => {
    expect(gridValueFromFraction(0.25, 0.5).urgency).toBe(2);
    expect(gridValueFromFraction(0.5, 0.5).urgency).toBe(3);
    expect(gridValueFromFraction(0.75, 0.5).urgency).toBe(4);
  });

  it("clamps out-of-range fractions to the border cells", () => {
    expect(gridValueFromFraction(-1, 2)).toEqual({ urgency: 1, importance: 1 });
    expect(gridValueFromFraction(2, -1)).toEqual({ urgency: 4, importance: 4 });
    expect(gridValueFromFraction(1, 1)).toEqual({ urgency: 4, importance: 1 });
  });

  it("roundtrips every grid value through its cell center", () => {
    for (let u = 1; u <= 4; u++) {
      for (let i = 1; i <= 4; i++) {
        const { fx, fy } = fractionFromGridValue(u, i);
        expect(fx).toBeGreaterThanOrEqual(0);
        expect(fx).toBeLessThanOrEqual(1);
        expect(fy).toBeGreaterThanOrEqual(0);
        expect(fy).toBeLessThanOrEqual(1);
        expect(gridValueFromFraction(fx, fy)).toEqual({ urgency: u, importance: i });
      }
    }
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
