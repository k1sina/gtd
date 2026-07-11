// Natural-language quick-add parsing.
//
//   "Call mom tomorrow at 3pm @phone #Family !urgent ~15m every week"
//
// Recognised fragments (case-insensitive, removed from the title):
//   dates      today | tonight | tomorrow | monday…sunday | next monday |
//              next week | next month | in N days/weeks/months
//   times      at 3pm | at 15:30 | 9:00am
//   tags       @phone @home
//   parent     #Family  (hint, resolved against open top-level task titles
//              by the caller; the new task files as a subtask)
//   priority   !urgent (urgency 4) | !important (importance 4) |
//              !someday (status someday)
//   estimate   ~30m | ~2h | ~1h30m
//   recurrence every day | every N days | every week | every monday |
//              every weekday | every N weeks | every month | every year

import { formatRule, type RecurrenceRule } from "./recurrence";

export interface ParsedQuickAdd {
  title: string;
  dueAt: Date | null;
  tags: string[];
  parentHint: string | null;
  urgency: number | null;
  importance: number | null;
  someday: boolean;
  estimatedMinutes: number | null;
  recurrenceRule: string | null;
}

const WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

/** 0 = Monday … 6 = Sunday. */
function isoWeekday(d: Date): number {
  return (d.getDay() + 6) % 7;
}

/** Next calendar day with the given ISO weekday; today when it matches (the caller decides whether a same-day match means today or next week). */
function upcomingWeekday(from: Date, target: number): Date {
  const diff = (target - isoWeekday(from) + 7) % 7;
  return addDays(startOfDay(from), diff);
}

export function parseQuickAdd(input: string, now: Date = new Date()): ParsedQuickAdd {
  let text = ` ${input.trim()} `;

  const out: ParsedQuickAdd = {
    title: "",
    dueAt: null,
    tags: [],
    parentHint: null,
    urgency: null,
    importance: null,
    someday: false,
    estimatedMinutes: null,
    recurrenceRule: null,
  };

  const eat = (re: RegExp, onMatch: (m: RegExpMatchArray) => void): void => {
    const m = text.match(re);
    if (m) {
      onMatch(m);
      text = text.replace(re, " ");
    }
  };

  // --- tags & parent ---------------------------------------------------------
  for (const m of text.matchAll(/(?<=\s)@([\w-]+)/g)) {
    out.tags.push(m[1]!.toLowerCase());
  }
  text = text.replace(/(?<=\s)@[\w-]+/g, " ");

  eat(/(?<=\s)#([\w][\w-]*)/, (m) => {
    out.parentHint = m[1]!;
  });

  // --- priority ------------------------------------------------------------
  eat(/(?<=\s)!urgent\b/i, () => {
    out.urgency = 4;
  });
  eat(/(?<=\s)!important\b/i, () => {
    out.importance = 4;
  });
  eat(/(?<=\s)!someday\b/i, () => {
    out.someday = true;
  });

  // --- estimate ~30m ~2h ~1h30m ---------------------------------------------
  eat(/(?<=\s)~(?:(\d+)h)?(?:(\d+)m?)?(?<=\S)(?=\s)/i, (m) => {
    const hours = m[1] ? parseInt(m[1], 10) : 0;
    const mins = m[2] ? parseInt(m[2], 10) : 0;
    if (hours || mins) out.estimatedMinutes = hours * 60 + mins;
  });

  // --- recurrence ------------------------------------------------------------
  const dayAlt = WEEKDAYS.join("|");
  eat(
    new RegExp(
      `(?<=\\s)every\\s+(?:(\\d+)\\s+)?(day|week|month|year|weekday|${dayAlt})s?\\b`,
      "i"
    ),
    (m) => {
      const interval = m[1] ? parseInt(m[1], 10) : 1;
      const unit = m[2]!.toLowerCase();
      let rule: RecurrenceRule | null = null;
      if (unit === "day") rule = { freq: "DAILY", interval };
      else if (unit === "week") rule = { freq: "WEEKLY", interval };
      else if (unit === "month") rule = { freq: "MONTHLY", interval };
      else if (unit === "year") rule = { freq: "YEARLY", interval };
      else if (unit === "weekday")
        rule = { freq: "WEEKLY", interval: 1, byday: [0, 1, 2, 3, 4] };
      else {
        const dayIdx = WEEKDAYS.indexOf(unit);
        if (dayIdx >= 0) rule = { freq: "WEEKLY", interval, byday: [dayIdx] };
      }
      if (rule) out.recurrenceRule = formatRule(rule);
    }
  );

  // --- time of day -----------------------------------------------------------
  let timeParts: { h: number; m: number } | null = null;
  eat(/(?<=\s)(?:at\s+)?(\d{1,2}):(\d{2})\s*(am|pm)?(?=[\s,.])/i, (m) => {
    let h = parseInt(m[1]!, 10);
    const ampm = m[3]?.toLowerCase();
    if (ampm === "pm" && h < 12) h += 12;
    if (ampm === "am" && h === 12) h = 0;
    timeParts = { h, m: parseInt(m[2]!, 10) };
  });
  if (!timeParts) {
    eat(/(?<=\s)at\s+(\d{1,2})\s*(am|pm)?(?=[\s,.])/i, (m) => {
      let h = parseInt(m[1]!, 10);
      const ampm = m[2]?.toLowerCase();
      if (ampm === "pm" && h < 12) h += 12;
      if (ampm === "am" && h === 12) h = 0;
      timeParts = { h, m: 0 };
    });
  }
  if (!timeParts) {
    eat(/(?<=\s)(\d{1,2})(am|pm)(?=[\s,.])/i, (m) => {
      let h = parseInt(m[1]!, 10);
      if (m[2]!.toLowerCase() === "pm" && h < 12) h += 12;
      if (m[2]!.toLowerCase() === "am" && h === 12) h = 0;
      timeParts = { h, m: 0 };
    });
  }

  // --- date ------------------------------------------------------------------
  let dueDay: Date | null = null;
  eat(/(?<=\s)today\b/i, () => {
    dueDay = startOfDay(now);
  });
  if (!dueDay)
    eat(/(?<=\s)tonight\b/i, () => {
      dueDay = startOfDay(now);
      if (!timeParts) timeParts = { h: 20, m: 0 };
    });
  if (!dueDay)
    eat(/(?<=\s)tomorrow\b/i, () => {
      dueDay = addDays(startOfDay(now), 1);
    });
  if (!dueDay)
    eat(/(?<=\s)next\s+week\b/i, () => {
      // Next Monday
      dueDay = addDays(startOfDay(now), ((7 - isoWeekday(now)) % 7) + (isoWeekday(now) === 0 ? 7 : 0) || 7);
    });
  if (!dueDay)
    eat(/(?<=\s)next\s+month\b/i, () => {
      const c = startOfDay(now);
      c.setMonth(c.getMonth() + 1, 1);
      dueDay = c;
    });
  if (!dueDay)
    eat(new RegExp(`(?<=\\s)(next\\s+)?(${dayAlt})\\b`, "i"), (m) => {
      const target = WEEKDAYS.indexOf(m[2]!.toLowerCase());
      let d = upcomingWeekday(now, target);
      // A weekday naming today ("monday" or "next monday" on a Monday)
      // means the coming one, not today.
      if (d.getTime() === startOfDay(now).getTime()) d = addDays(d, 7);
      dueDay = d;
    });
  if (!dueDay)
    eat(/(?<=\s)in\s+(\d+)\s+(day|week|month)s?\b/i, (m) => {
      const n = parseInt(m[1]!, 10);
      const unit = m[2]!.toLowerCase();
      if (unit === "day") dueDay = addDays(startOfDay(now), n);
      else if (unit === "week") dueDay = addDays(startOfDay(now), n * 7);
      else {
        const c = startOfDay(now);
        c.setMonth(c.getMonth() + n);
        dueDay = c;
      }
    });

  if (dueDay) {
    const due: Date = dueDay;
    const tp = timeParts as { h: number; m: number } | null;
    if (tp) due.setHours(tp.h, tp.m, 0, 0);
    else due.setHours(17, 0, 0, 0); // default end-of-workday
    out.dueAt = due;
  } else if (timeParts) {
    const tp = timeParts as { h: number; m: number };
    const due = startOfDay(now);
    due.setHours(tp.h, tp.m, 0, 0);
    if (due <= now) due.setDate(due.getDate() + 1);
    out.dueAt = due;
  }

  out.title = text.replace(/\s+/g, " ").trim();
  return out;
}
