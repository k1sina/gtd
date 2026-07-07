// Small date helpers (no library; the app deals in local time).

export function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

export function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

/** 0 = Monday … 6 = Sunday. */
export function isoWeekday(d: Date): number {
  return (d.getDay() + 6) % 7;
}

export function startOfWeek(d: Date): Date {
  return addDays(startOfDay(d), -isoWeekday(d));
}

export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatDue(dueAt: string, now: Date = new Date()): {
  label: string;
  tone: "red" | "amber" | "neutral";
} {
  const due = new Date(dueAt);
  const days = Math.round(
    (startOfDay(due).getTime() - startOfDay(now).getTime()) / 86400000
  );
  const time =
    due.getHours() !== 17 || due.getMinutes() !== 0
      ? ` ${due.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
      : "";

  if (days < 0)
    return { label: days === -1 ? "Yesterday" : `${-days}d overdue`, tone: "red" };
  if (days === 0) return { label: `Today${time}`, tone: "red" };
  if (days === 1) return { label: `Tomorrow${time}`, tone: "amber" };
  if (days < 7)
    return {
      label: due.toLocaleDateString([], { weekday: "short" }) + time,
      tone: "neutral",
    };
  return {
    label: due.toLocaleDateString([], { month: "short", day: "numeric" }),
    tone: "neutral",
  };
}

export function formatMinutes(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h${m}m` : `${h}h`;
}

/** ISO week period (Mon..Sun) containing `d`, as date keys. */
export function weekPeriod(d: Date): { start: string; end: string } {
  const start = startOfWeek(d);
  return { start: toDateKey(start), end: toDateKey(addDays(start, 6)) };
}

export function quarterOf(d: Date): { year: number; quarter: number } {
  return { year: d.getFullYear(), quarter: Math.floor(d.getMonth() / 3) + 1 };
}

export function quarterPeriod(year: number, quarter: number): {
  start: string;
  end: string;
} {
  const start = new Date(year, (quarter - 1) * 3, 1);
  const end = new Date(year, quarter * 3, 0);
  return { start: toDateKey(start), end: toDateKey(end) };
}
