// A deliberately small RRULE subset (RFC 5545 syntax) that covers the
// recurrences a GTD app needs and is easy to mirror in Swift later.
//
// Supported: FREQ=DAILY|WEEKLY|MONTHLY|YEARLY, INTERVAL=n,
//            BYDAY=MO,TU,... (weekly), BYMONTHDAY=n (monthly).

export interface RecurrenceRule {
  freq: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  interval: number;
  byday?: number[]; // 0 = Monday … 6 = Sunday
  bymonthday?: number;
}

const DAY_CODES = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export function parseRule(rule: string): RecurrenceRule | null {
  const parts: Record<string, string> = {};
  for (const kv of rule.replace(/^RRULE:/, "").split(";")) {
    const [k, v] = kv.split("=");
    if (k && v) parts[k.toUpperCase()] = v.toUpperCase();
  }
  const freq = parts["FREQ"];
  if (freq !== "DAILY" && freq !== "WEEKLY" && freq !== "MONTHLY" && freq !== "YEARLY") {
    return null;
  }
  const parsed: RecurrenceRule = {
    freq,
    interval: Math.max(1, parseInt(parts["INTERVAL"] ?? "1", 10) || 1),
  };
  if (parts["BYDAY"]) {
    const days = parts["BYDAY"]
      .split(",")
      .map((c) => DAY_CODES.indexOf(c.trim() as (typeof DAY_CODES)[number]))
      .filter((i) => i >= 0);
    if (days.length > 0) parsed.byday = [...new Set(days)].sort();
  }
  if (parts["BYMONTHDAY"]) {
    const d = parseInt(parts["BYMONTHDAY"], 10);
    if (d >= 1 && d <= 31) parsed.bymonthday = d;
  }
  return parsed;
}

export function formatRule(rule: RecurrenceRule): string {
  let s = `FREQ=${rule.freq};INTERVAL=${rule.interval}`;
  if (rule.byday && rule.byday.length > 0) {
    s += `;BYDAY=${rule.byday.map((d) => DAY_CODES[d]).join(",")}`;
  }
  if (rule.bymonthday) s += `;BYMONTHDAY=${rule.bymonthday}`;
  return s;
}

/** 0 = Monday … 6 = Sunday (JS getDay() is 0 = Sunday). */
function isoWeekday(d: Date): number {
  return (d.getDay() + 6) % 7;
}

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function startOfWeek(d: Date): Date {
  const c = startOfDay(d);
  c.setDate(c.getDate() - isoWeekday(c));
  return c;
}

function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The first occurrence strictly after `after`, anchored at `anchor` (the
 * occurrence being completed — used to phase INTERVAL > 1 and preserve the
 * time of day). Returns null if the rule is unsupported.
 */
export function nextOccurrence(
  rule: string | RecurrenceRule,
  anchor: Date,
  after: Date = anchor
): Date | null {
  const r = typeof rule === "string" ? parseRule(rule) : rule;
  if (!r) return null;

  const withAnchorTime = (day: Date): Date => {
    const c = new Date(day);
    c.setHours(anchor.getHours(), anchor.getMinutes(), 0, 0);
    return c;
  };

  if (r.freq === "YEARLY") {
    for (let i = 1; i <= 200; i++) {
      const candidate = new Date(anchor);
      candidate.setFullYear(anchor.getFullYear() + i * r.interval);
      // setFullYear rolls a Feb 29 anchor into Mar 1 on non-leap years;
      // clamp back to Feb 28 (the Swift engine's Calendar does the same).
      if (candidate.getMonth() !== anchor.getMonth()) candidate.setDate(0);
      if (candidate > after) return candidate;
    }
    return null;
  }

  const anchorDay = startOfDay(anchor);
  const anchorWeek = startOfWeek(anchor);

  // Scan day by day from the later of (anchor, after); include that day
  // itself when the anchor's time of day still lies ahead of `after`.
  const base = startOfDay(after >= anchor ? after : anchor);
  let cursor = withAnchorTime(base) > after && base > anchorDay ? base : addDays(base, 1);

  for (let i = 0; i < 1600; i++, cursor = addDays(cursor, 1)) {
    let matches = false;
    switch (r.freq) {
      case "DAILY": {
        const diff = Math.round((cursor.getTime() - anchorDay.getTime()) / DAY_MS);
        matches = diff > 0 && diff % r.interval === 0;
        break;
      }
      case "WEEKLY": {
        const weeks = Math.round(
          (startOfWeek(cursor).getTime() - anchorWeek.getTime()) / (7 * DAY_MS)
        );
        const days = r.byday ?? [isoWeekday(anchorDay)];
        matches = weeks % r.interval === 0 && days.includes(isoWeekday(cursor));
        break;
      }
      case "MONTHLY": {
        const months =
          (cursor.getFullYear() - anchorDay.getFullYear()) * 12 +
          (cursor.getMonth() - anchorDay.getMonth());
        const targetDay = r.bymonthday ?? anchorDay.getDate();
        const lastOfMonth = new Date(
          cursor.getFullYear(),
          cursor.getMonth() + 1,
          0
        ).getDate();
        matches =
          months % r.interval === 0 &&
          cursor.getDate() === Math.min(targetDay, lastOfMonth);
        break;
      }
    }
    if (matches) {
      const result = withAnchorTime(cursor);
      if (result > after) return result;
    }
  }
  return null;
}

export function describeRule(rule: string | RecurrenceRule): string {
  const r = typeof rule === "string" ? parseRule(rule) : rule;
  if (!r) return "custom";
  const every = (unit: string) =>
    r.interval === 1 ? `every ${unit}` : `every ${r.interval} ${unit}s`;
  switch (r.freq) {
    case "DAILY":
      return every("day");
    case "WEEKLY": {
      const base = every("week");
      if (!r.byday || r.byday.length === 0) return base;
      if (r.byday.length === 7) return every("day");
      return `${base} on ${r.byday.map((d) => DAY_NAMES[d]).join(", ")}`;
    }
    case "MONTHLY":
      return r.bymonthday
        ? `${every("month")} on day ${r.bymonthday}`
        : every("month");
    case "YEARLY":
      return every("year");
  }
}
