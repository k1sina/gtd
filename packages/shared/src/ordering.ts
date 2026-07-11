// Manual list ordering. sort_order (double, default 0) is the user's
// hand-placed position: lists sort by it first, so an untouched list (all
// zeros) falls back to priority order, and the first drag pins the order.
// New tasks arrive at 0 and therefore surface at the top until placed.
//
// Mirrored in apps/apple/ClarityCore/Sources/ClarityCore/Ordering.swift —
// keep the two (and their test tables) in sync.

import { priorityScore, type Prioritizable } from "./priority";

export interface Orderable {
  id: string;
  sort_order: number;
}

export interface OrderPatch {
  id: string;
  sort_order: number;
}

/**
 * Comparator for manually orderable lists: sort_order ascending, ties broken
 * by priority score (so unplaced tasks keep the leverage ranking), then by
 * creation time for stability.
 */
export function byUserOrder<
  T extends Prioritizable & Orderable & { created_at: string },
>(now: Date = new Date()) {
  return (a: T, b: T) =>
    a.sort_order - b.sort_order ||
    priorityScore(b, now) - priorityScore(a, now) ||
    a.created_at.localeCompare(b.created_at);
}

/**
 * Patches that persist moving `items[from]` to display position `to`.
 * When the new neighbours leave numeric room the moved item gets the
 * midpoint — a single write. When they don't (ties, e.g. a list that has
 * never been reordered), the whole list is renumbered 1..n, emitting patches
 * only for rows whose value changes.
 */
export function reorderPatches(
  items: readonly Orderable[],
  from: number,
  to: number
): OrderPatch[] {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= items.length ||
    to >= items.length
  ) {
    return [];
  }

  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);

  const prev = next[to - 1]?.sort_order;
  const succ = next[to + 1]?.sort_order;

  let value: number | undefined;
  if (prev === undefined && succ !== undefined) value = succ - 1;
  else if (succ === undefined && prev !== undefined) value = prev + 1;
  else if (prev !== undefined && succ !== undefined && prev < succ) {
    value = prev + (succ - prev) / 2;
  }

  // Strict bounds guard against float underflow collapsing the midpoint
  // onto a neighbour.
  if (
    value !== undefined &&
    (prev === undefined || value > prev) &&
    (succ === undefined || value < succ)
  ) {
    return [{ id: moved.id, sort_order: value }];
  }

  return next.flatMap((item, i) =>
    item.sort_order === i + 1 ? [] : [{ id: item.id, sort_order: i + 1 }]
  );
}
