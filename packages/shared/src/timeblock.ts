// Automated time-blocking: fit the highest-priority tasks into the free
// gaps of a working day around existing calendar events. Pure logic — the
// caller supplies tasks, busy intervals, and preferences.

import { priorityScore, type Prioritizable } from "./priority";

export interface Interval {
  start: Date;
  end: Date;
}

export interface PlannableTask extends Prioritizable {
  id: string;
  title: string;
  estimated_minutes?: number | null;
}

export interface PlannerConfig {
  /** "HH:MM" 24h local time. */
  workStart: string;
  workEnd: string;
  /** Block length used when a task has no estimate. */
  defaultBlockMinutes: number;
  /** Gap left between consecutive blocks. */
  bufferMinutes: number;
  /** Cap on a single block; longer estimates are truncated to this. */
  maxBlockMinutes: number;
  /** Maximum number of blocks to propose per day. */
  maxBlocks: number;
}

export const DEFAULT_PLANNER_CONFIG: PlannerConfig = {
  workStart: "09:00",
  workEnd: "17:00",
  defaultBlockMinutes: 45,
  bufferMinutes: 10,
  maxBlockMinutes: 120,
  maxBlocks: 6,
};

export interface ProposedBlock {
  taskId: string;
  title: string;
  start: Date;
  end: Date;
}

const MIN_MS = 60_000;

function atTime(day: Date, hhmm: string): Date {
  const [h = 0, m = 0] = hhmm.split(":").map((n) => parseInt(n, 10));
  const d = new Date(day);
  d.setHours(h, m, 0, 0);
  return d;
}

/** Merge overlapping/adjacent intervals into a sorted disjoint list. */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = [...intervals]
    .filter((i) => i.end > i.start)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const merged: Interval[] = [];
  for (const cur of sorted) {
    const last = merged[merged.length - 1];
    if (last && cur.start <= last.end) {
      if (cur.end > last.end) last.end = cur.end;
    } else {
      merged.push({ start: new Date(cur.start), end: new Date(cur.end) });
    }
  }
  return merged;
}

/** Free gaps inside [windowStart, windowEnd] not covered by busy intervals. */
export function freeSlots(
  window: Interval,
  busy: Interval[]
): Interval[] {
  const slots: Interval[] = [];
  let cursor = new Date(window.start);
  for (const b of mergeIntervals(busy)) {
    if (b.end <= window.start || b.start >= window.end) continue;
    if (b.start > cursor) {
      slots.push({ start: new Date(cursor), end: new Date(b.start) });
    }
    if (b.end > cursor) cursor = new Date(b.end);
  }
  if (cursor < window.end) {
    slots.push({ start: new Date(cursor), end: new Date(window.end) });
  }
  return slots;
}

/**
 * Propose time blocks for `day`: highest-priority tasks first, each placed
 * in the earliest free slot that fits. Planning never starts in the past —
 * when `now` falls inside the working window the window is clipped to it.
 */
export function planDay(
  tasks: PlannableTask[],
  busy: Interval[],
  day: Date,
  config: PlannerConfig = DEFAULT_PLANNER_CONFIG,
  now: Date = new Date()
): ProposedBlock[] {
  const windowStart = atTime(day, config.workStart);
  const windowEnd = atTime(day, config.workEnd);
  const effectiveStart = now > windowStart ? now : windowStart;
  if (effectiveStart >= windowEnd) return [];

  let slots = freeSlots({ start: effectiveStart, end: windowEnd }, busy);
  const blocks: ProposedBlock[] = [];

  const ordered = [...tasks].sort(
    (a, b) => priorityScore(b, now) - priorityScore(a, now)
  );

  for (const task of ordered) {
    if (blocks.length >= config.maxBlocks) break;
    const minutes = Math.min(
      task.estimated_minutes ?? config.defaultBlockMinutes,
      config.maxBlockMinutes
    );
    const needed = minutes * MIN_MS;

    const slotIndex = slots.findIndex(
      (s) => s.end.getTime() - s.start.getTime() >= needed
    );
    if (slotIndex === -1) continue;

    const slot = slots[slotIndex]!;
    const start = new Date(slot.start);
    const end = new Date(start.getTime() + needed);
    blocks.push({ taskId: task.id, title: task.title, start, end });

    // Consume the used portion plus the buffer.
    const nextStart = new Date(end.getTime() + config.bufferMinutes * MIN_MS);
    const rest: Interval[] = [];
    if (nextStart < slot.end) rest.push({ start: nextStart, end: slot.end });
    slots = [...slots.slice(0, slotIndex), ...rest, ...slots.slice(slotIndex + 1)];
  }

  return blocks;
}
