"use client";

import clsx from "clsx";
import { CalendarCheck, ChevronRight, Compass, Flame } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/task-list";
import { useReviews } from "@/lib/data";
import { addDays, quarterOf, weekPeriod } from "@/lib/format";

/** Consecutive weeks (ending this or last week) with a completed weekly review. */
function weeklyStreak(periods: Set<string>, now: Date): number {
  let streak = 0;
  let cursor = new Date(now);
  if (periods.has(weekPeriod(cursor).start)) streak += 1;
  cursor = addDays(cursor, -7);
  for (let i = 0; i < 260; i++, cursor = addDays(cursor, -7)) {
    if (periods.has(weekPeriod(cursor).start)) streak += 1;
    else break;
  }
  return streak;
}

export default function ReviewsPage() {
  const { data: reviews = [] } = useReviews();
  const now = new Date();
  const thisWeek = weekPeriod(now);
  const { year, quarter } = quarterOf(now);

  const completed = reviews.filter((r) => r.completed_at);
  const weeklyDone = new Set(
    completed.filter((r) => r.type === "weekly").map((r) => r.period_start)
  );
  const streak = weeklyStreak(weeklyDone, now);
  const doneThisWeek = weeklyDone.has(thisWeek.start);
  const quarterlyDoneThisQuarter = completed.some(
    (r) =>
      r.type === "quarterly" &&
      quarterOf(new Date(r.period_start + "T12:00:00")).quarter === quarter &&
      new Date(r.period_start).getFullYear() === year
  );

  return (
    <div>
      <PageHeader
        title="Reviews"
        subtitle="The habit that makes GTD work — step back, get current, get creative"
      />

      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/review/weekly"
          className={clsx(
            "flex flex-col gap-2 rounded-xl border p-5 transition-shadow hover:shadow-sm",
            doneThisWeek
              ? "border-emerald-200 bg-emerald-50/40"
              : "border-accent/40 bg-accent-soft/40"
          )}
        >
          <div className="flex items-center justify-between">
            <CalendarCheck
              size={20}
              className={doneThisWeek ? "text-emerald-600" : "text-accent"}
            />
            {streak > 0 && (
              <span className="flex items-center gap-1 text-xs font-semibold text-amber-600">
                <Flame size={13} />
                {streak} week{streak === 1 ? "" : "s"}
              </span>
            )}
          </div>
          <h2 className="font-semibold">Weekly review</h2>
          <p className="text-xs text-ink-soft">
            {doneThisWeek
              ? "Done for this week — see you next week."
              : "Empty your inbox, review every project, and set the week's priorities."}
          </p>
          <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-accent">
            {doneThisWeek ? "Review again" : "Start review"}
            <ChevronRight size={13} />
          </span>
        </Link>

        <Link
          href="/review/quarterly"
          className={clsx(
            "flex flex-col gap-2 rounded-xl border p-5 transition-shadow hover:shadow-sm",
            quarterlyDoneThisQuarter
              ? "border-emerald-200 bg-emerald-50/40"
              : "border-line bg-surface"
          )}
        >
          <Compass size={20} className="text-ink-soft" />
          <h2 className="font-semibold">
            Quarterly review — Q{quarter} {year}
          </h2>
          <p className="text-xs text-ink-soft">
            {quarterlyDoneThisQuarter
              ? "Done for this quarter."
              : "Score your goals, reflect on the quarter, and set goals for the next one."}
          </p>
          <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-accent">
            Open <ChevronRight size={13} />
          </span>
        </Link>
      </div>

      {completed.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">
            History
          </h2>
          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            {completed.slice(0, 12).map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between border-b border-line px-4 py-2.5 text-sm last:border-0"
              >
                <span className="font-medium capitalize">{r.type} review</span>
                <span className="text-xs text-ink-soft">
                  {new Date(r.period_start + "T12:00:00").toLocaleDateString([], {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}{" "}
                  – {new Date(r.period_end + "T12:00:00").toLocaleDateString([], {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
                {r.notes ? (
                  <span className="max-w-56 truncate text-xs text-ink-faint">
                    {r.notes}
                  </span>
                ) : (
                  <span />
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
