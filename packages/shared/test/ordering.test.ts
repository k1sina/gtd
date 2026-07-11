import { describe, expect, it } from "vitest";
import { byUserOrder, reorderPatches, type Orderable } from "../src/ordering";

// Mirrored in Swift: ClarityCore OrderingTests — keep the tables in sync.

const now = new Date("2026-07-11T12:00:00.000Z");

function items(...orders: number[]): Orderable[] {
  return orders.map((sort_order, i) => ({ id: `t${i}`, sort_order }));
}

describe("byUserOrder", () => {
  const task = (over: {
    id: string;
    sort_order?: number;
    urgency?: number;
    importance?: number;
    created_at?: string;
  }) => ({
    sort_order: 0,
    urgency: 2,
    importance: 2,
    due_at: null,
    defer_until: null,
    created_at: "2026-07-01T00:00:00.000Z",
    ...over,
  });

  it("sorts by sort_order first, regardless of priority", () => {
    const list = [
      task({ id: "low", sort_order: 2, urgency: 4, importance: 4 }),
      task({ id: "high", sort_order: 1, urgency: 1, importance: 1 }),
    ];
    expect(list.sort(byUserOrder(now)).map((t) => t.id)).toEqual([
      "high",
      "low",
    ]);
  });

  it("breaks sort_order ties by priority score, then created_at", () => {
    const list = [
      task({ id: "older", created_at: "2026-06-01T00:00:00.000Z" }),
      task({ id: "newer", created_at: "2026-06-02T00:00:00.000Z" }),
      task({ id: "important", importance: 4 }),
    ];
    expect(list.sort(byUserOrder(now)).map((t) => t.id)).toEqual([
      "important",
      "older",
      "newer",
    ]);
  });

  it("puts unplaced (0) tasks above a renumbered (1..n) list", () => {
    const list = [
      task({ id: "placed", sort_order: 1 }),
      task({ id: "fresh", sort_order: 0 }),
    ];
    expect(list.sort(byUserOrder(now)).map((t) => t.id)).toEqual([
      "fresh",
      "placed",
    ]);
  });
});

describe("reorderPatches", () => {
  it("returns no patches for a no-op or out-of-range move", () => {
    expect(reorderPatches(items(1, 2, 3), 1, 1)).toEqual([]);
    expect(reorderPatches(items(1, 2, 3), -1, 2)).toEqual([]);
    expect(reorderPatches(items(1, 2, 3), 0, 3)).toEqual([]);
    expect(reorderPatches([], 0, 0)).toEqual([]);
  });

  it("writes the midpoint when the new neighbours leave room", () => {
    // move t0 between t2 (=3) and t3 (=4)
    expect(reorderPatches(items(1, 2, 3, 4), 0, 2)).toEqual([
      { id: "t0", sort_order: 3.5 },
    ]);
  });

  it("moves to the top with neighbour - 1", () => {
    expect(reorderPatches(items(1, 2, 3), 2, 0)).toEqual([
      { id: "t2", sort_order: 0 },
    ]);
  });

  it("moves to the bottom with neighbour + 1", () => {
    expect(reorderPatches(items(1, 2, 3), 0, 2)).toEqual([
      { id: "t0", sort_order: 4 },
    ]);
  });

  it("moving to the top of a never-ordered list still needs one write", () => {
    // all zeros: the mover goes above them at -1
    expect(reorderPatches(items(0, 0, 0), 2, 0)).toEqual([
      { id: "t2", sort_order: -1 },
    ]);
  });

  it("midpoint between duplicated values works when there is room", () => {
    expect(reorderPatches(items(1, 2, 2, 4), 3, 1)).toEqual([
      { id: "t3", sort_order: 1.5 },
    ]);
  });

  it("renumber emits patches only for rows that change", () => {
    // collision between equal neighbours (2 and 2) → renumber; t3 already
    // sits at its slot value 4 and is skipped.
    expect(reorderPatches(items(1, 2, 2, 4), 0, 1)).toEqual([
      { id: "t1", sort_order: 1 },
      { id: "t0", sort_order: 2 },
      { id: "t2", sort_order: 3 },
    ]);
  });

  it("moving between a tie renumbers the displayed order", () => {
    expect(reorderPatches(items(5, 5, 5), 0, 1)).toEqual([
      { id: "t1", sort_order: 1 },
      { id: "t0", sort_order: 2 },
      { id: "t2", sort_order: 3 },
    ]);
  });

  it("single-write results keep every other row untouched", () => {
    const list = items(10, 20, 30, 40);
    const patches = reorderPatches(list, 3, 1);
    expect(patches).toEqual([{ id: "t3", sort_order: 15 }]);
  });
});
