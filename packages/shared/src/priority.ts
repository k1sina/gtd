// Eisenhower prioritisation: urgency × importance (each 1..4, 4 = highest),
// refined by due-date proximity into a single sortable score.

export type Quadrant = "do" | "schedule" | "delegate" | "eliminate";

const HIGH = 3; // 3..4 counts as "high" on either axis

export function quadrant(urgency: number, importance: number): Quadrant {
  const urgent = urgency >= HIGH;
  const important = importance >= HIGH;
  if (urgent && important) return "do";
  if (!urgent && important) return "schedule";
  if (urgent && !important) return "delegate";
  return "eliminate";
}

export const QUADRANT_LABELS: Record<Quadrant, string> = {
  do: "Do first",
  schedule: "Schedule",
  delegate: "Delegate",
  eliminate: "Eliminate",
};

/** Steps per axis on the priority grid (values are 1..PRIORITY_STEPS). */
export const PRIORITY_STEPS = 4;

/**
 * Map a point on the unit square (y measured DOWN, screen-style) to snapped
 * grid values. Out-of-range fractions clamp, so drags past the edge stick to
 * the border cells. x = urgency, y = importance (importance grows upward).
 */
export function gridValueFromFraction(
  fx: number,
  fy: number
): { urgency: number; importance: number } {
  const cell = (f: number) =>
    Math.min(PRIORITY_STEPS, Math.max(1, Math.floor(f * PRIORITY_STEPS) + 1));
  return { urgency: cell(fx), importance: cell(1 - fy) };
}

/** Unit-square center (y down) of a grid cell, for placing the dot. */
export function fractionFromGridValue(
  urgency: number,
  importance: number
): { fx: number; fy: number } {
  return {
    fx: (urgency - 0.5) / PRIORITY_STEPS,
    fy: 1 - (importance - 0.5) / PRIORITY_STEPS,
  };
}

export interface Prioritizable {
  urgency: number;
  importance: number;
  due_at?: string | null;
  defer_until?: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Higher = more pressing. Importance dominates urgency (GTD favours the
 * important over the merely loud); an approaching or overdue due date adds
 * a boost so deadlines float upward regardless of quadrant.
 */
export function priorityScore(task: Prioritizable, now: Date = new Date()): number {
  let score = task.importance * 10 + task.urgency * 5;

  if (task.due_at) {
    const days = (new Date(task.due_at).getTime() - now.getTime()) / DAY_MS;
    if (days < 0) score += 30;
    else if (days < 1) score += 20;
    else if (days < 3) score += 10;
    else if (days < 7) score += 5;
  }

  return score;
}

/** True when a task is deferred into the future and should be hidden from action lists. */
export function isDeferred(task: Prioritizable, now: Date = new Date()): boolean {
  return !!task.defer_until && new Date(task.defer_until).getTime() > now.getTime();
}

export function byPriority<T extends Prioritizable>(now: Date = new Date()) {
  return (a: T, b: T) => priorityScore(b, now) - priorityScore(a, now);
}
