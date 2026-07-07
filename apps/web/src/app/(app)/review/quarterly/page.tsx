"use client";

import type { GoalStatus, Review } from "@gtd/shared";
import clsx from "clsx";
import { ArrowLeft, PartyPopper, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button, Input, Textarea } from "@/components/ui";
import { useGoals, useReviews, useSaveGoal, useSaveReview } from "@/lib/data";
import { quarterOf, quarterPeriod } from "@/lib/format";

function statusFromScore(score: number): GoalStatus {
  if (score >= 8) return "achieved";
  if (score >= 4) return "partial";
  return "dropped";
}

export default function QuarterlyReviewPage() {
  const { data: goals = [] } = useGoals();
  const { data: reviews = [] } = useReviews("quarterly");
  const saveGoal = useSaveGoal();
  const saveReview = useSaveReview();

  const now = new Date();
  const { year, quarter } = quarterOf(now);
  const period = quarterPeriod(year, quarter);
  const nextQ = quarter === 4 ? { year: year + 1, quarter: 1 } : { year, quarter: quarter + 1 };

  const existing: Review | undefined = reviews.find(
    (r) => r.period_start === period.start
  );

  const currentGoals = goals.filter(
    (g) => g.year === year && g.quarter === quarter
  );

  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [newGoals, setNewGoals] = useState<string[]>([""]);
  const [finished, setFinished] = useState(false);

  async function finish() {
    // Create next quarter's goals from the filled-in rows.
    for (const title of newGoals.map((t) => t.trim()).filter(Boolean)) {
      await saveGoal.mutateAsync({
        title,
        year: nextQ.year,
        quarter: nextQ.quarter,
      });
    }
    await saveReview.mutateAsync({
      id: existing?.id,
      type: "quarterly",
      period_start: period.start,
      period_end: period.end,
      checklist: { scored: true },
      notes,
      completed_at: new Date().toISOString(),
    });
    setFinished(true);
  }

  if (finished) {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-center">
        <PartyPopper size={32} className="text-accent" />
        <h1 className="text-xl font-semibold">
          Q{quarter} review complete
        </h1>
        <p className="max-w-sm text-sm text-ink-soft">
          Goals for Q{nextQ.quarter} {nextQ.year} are set. Break them into
          projects when you&apos;re ready.
        </p>
        <Link href="/goals">
          <Button variant="primary" className="mt-2">
            See goals
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div>
      <Link
        href="/review"
        className="mb-4 inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink"
      >
        <ArrowLeft size={14} /> Reviews
      </Link>

      <h1 className="text-xl font-semibold">
        Quarterly review — Q{quarter} {year}
      </h1>
      <p className="mt-1 mb-6 text-sm text-ink-soft">
        Score each goal, reflect on the quarter, then set goals for Q
        {nextQ.quarter}.
      </p>

      {/* 1. Score goals */}
      <section className="mb-6 rounded-xl border border-line bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold">
          1 · How did this quarter&apos;s goals go?
        </h2>
        {currentGoals.length === 0 ? (
          <p className="text-sm text-ink-faint">
            No goals were set for this quarter.{" "}
            <Link href="/goals" className="text-accent hover:underline">
              Add some
            </Link>{" "}
            or skip to reflection.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {currentGoals.map((g) => (
              <div key={g.id}>
                <p className="mb-1.5 text-sm font-medium">{g.title}</p>
                <div className="flex items-center gap-1">
                  {Array.from({ length: 11 }, (_, i) => (
                    <button
                      key={i}
                      onClick={() =>
                        saveGoal.mutate({
                          id: g.id,
                          score: i,
                          status: statusFromScore(i),
                        })
                      }
                      className={clsx(
                        "h-7 w-7 rounded-md border text-xs font-medium transition-colors cursor-pointer",
                        g.score === i
                          ? "border-accent bg-accent text-white"
                          : "border-line text-ink-soft hover:border-accent"
                      )}
                    >
                      {i}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 2. Reflect */}
      <section className="mb-6 rounded-xl border border-line bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold">2 · Reflect</h2>
        <Textarea
          rows={4}
          placeholder="What worked? What didn't? What did you learn? What deserves more of your time next quarter?"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </section>

      {/* 3. Next quarter's goals */}
      <section className="mb-6 rounded-xl border border-line bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold">
          3 · Goals for Q{nextQ.quarter} {nextQ.year}
        </h2>
        <div className="flex flex-col gap-2">
          {newGoals.map((g, i) => (
            <Input
              key={i}
              placeholder={`Goal ${i + 1}`}
              value={g}
              onChange={(e) =>
                setNewGoals(newGoals.map((v, j) => (j === i ? e.target.value : v)))
              }
            />
          ))}
          <Button
            size="sm"
            className="self-start"
            onClick={() => setNewGoals([...newGoals, ""])}
          >
            <Plus size={13} /> Another goal
          </Button>
        </div>
      </section>

      <div className="flex justify-end">
        <Button variant="primary" onClick={finish}>
          Finish quarterly review
        </Button>
      </div>
    </div>
  );
}
