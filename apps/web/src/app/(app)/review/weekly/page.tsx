"use client";

import type { Review } from "@gtd/shared";
import { byPriority, hasOpenSubtasks, isStalledParent } from "@gtd/shared";
import clsx from "clsx";
import { ArrowLeft, Check, PartyPopper } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { TaskList } from "@/components/task-list";
import { Button, Textarea } from "@/components/ui";
import { useReviews, useSaveReview, useTasks } from "@/lib/data";
import { addDays, startOfDay, weekPeriod } from "@/lib/format";
import { useSpace } from "@/lib/space-context";

const STEPS = [
  { key: "inbox", title: "Get to inbox zero" },
  { key: "calendar", title: "Review your calendar ± 2 weeks" },
  { key: "projects", title: "Give every project a next action" },
  { key: "waiting", title: "Chase up Waiting-For items" },
  { key: "someday", title: "Rescan Someday / maybe" },
  { key: "priorities", title: "Set this week's priorities" },
] as const;

export default function WeeklyReviewPage() {
  const { currentSpace } = useSpace();
  const { data: tasks = [] } = useTasks(currentSpace?.id);
  const { data: reviews = [] } = useReviews("weekly");
  const saveReview = useSaveReview();

  const now = new Date();
  const period = weekPeriod(now);
  const existing: Review | undefined = reviews.find(
    (r) => r.period_start === period.start
  );

  const [step, setStep] = useState(0);
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [finished, setFinished] = useState(false);

  const checklist = existing?.checklist ?? {};

  const data = useMemo(() => {
    const open = tasks.filter(
      (t) => !t.parent_task_id && !["done", "cancelled"].includes(t.status)
    );
    const twoWeeksAgo = addDays(startOfDay(now), -14);
    const twoWeeksOut = addDays(startOfDay(now), 15);
    return {
      inbox: open.filter((t) => t.status === "inbox"),
      calendar: open
        .filter(
          (t) =>
            t.due_at &&
            new Date(t.due_at) >= twoWeeksAgo &&
            new Date(t.due_at) < twoWeeksOut
        )
        .sort(
          (a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime()
        ),
      // "Projects" = top-level tasks with open subtasks.
      stalledParents: open.filter((t) => isStalledParent(t, tasks, now)),
      activeParents: open.filter(
        (t) => t.status !== "someday" && hasOpenSubtasks(t.id, tasks)
      ),
      waiting: open.filter((t) => t.status === "waiting"),
      someday: open.filter((t) => t.status === "someday"),
      top: open
        .filter((t) => t.status === "next")
        .sort(byPriority(now))
        .slice(0, 7),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks]);

  async function persist(patch: Partial<Review>) {
    await saveReview.mutateAsync({
      id: existing?.id,
      type: "weekly",
      period_start: period.start,
      period_end: period.end,
      checklist: { ...checklist, ...(patch.checklist ?? {}) },
      notes,
      ...patch,
    });
  }

  async function completeStep() {
    const key = STEPS[step]!.key;
    if (step < STEPS.length - 1) {
      setStep(step + 1);
      await persist({ checklist: { ...checklist, [key]: true } });
    } else {
      await persist({
        checklist: { ...checklist, [key]: true },
        completed_at: new Date().toISOString(),
      });
      setFinished(true);
    }
  }

  const current = STEPS[step]!;

  if (finished) {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-center">
        <PartyPopper size={32} className="text-accent" />
        <h1 className="text-xl font-semibold">Weekly review complete</h1>
        <p className="max-w-sm text-sm text-ink-soft">
          Your system is current. Trust it, and get back to doing.
        </p>
        <Link href="/next">
          <Button variant="primary" className="mt-2">
            Go to Next actions
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

      <div className="mb-6">
        <h1 className="text-xl font-semibold">Weekly review</h1>
        <div className="mt-3 flex items-center gap-1.5">
          {STEPS.map((s, i) => (
            <button
              key={s.key}
              onClick={() => setStep(i)}
              title={s.title}
              className={clsx(
                "h-1.5 flex-1 rounded-full transition-colors cursor-pointer",
                i < step || checklist[s.key]
                  ? "bg-emerald-500"
                  : i === step
                    ? "bg-accent"
                    : "bg-black/10"
              )}
            />
          ))}
        </div>
        <p className="mt-2 text-xs text-ink-faint">
          Step {step + 1} of {STEPS.length}
        </p>
      </div>

      <div className="rounded-xl border border-line bg-surface p-5">
        <h2 className="text-base font-semibold">{current.title}</h2>

        {current.key === "inbox" && (
          <div className="mt-3">
            {data.inbox.length === 0 ? (
              <p className="flex items-center gap-1.5 text-sm text-emerald-600">
                <Check size={15} /> Inbox zero — nothing to clarify.
              </p>
            ) : (
              <>
                <p className="mb-3 text-sm text-ink-soft">
                  {data.inbox.length} item{data.inbox.length === 1 ? "" : "s"}{" "}
                  waiting.{" "}
                  <Link href="/inbox" className="text-accent hover:underline">
                    Clarify them
                  </Link>{" "}
                  and come back.
                </p>
                <TaskList tasks={data.inbox.slice(0, 8)} />
              </>
            )}
          </div>
        )}

        {current.key === "calendar" && (
          <div className="mt-3">
            <p className="mb-3 text-sm text-ink-soft">
              Anything date-bound in the last and next two weeks — reschedule
              what slipped, prepare for what&apos;s coming.
            </p>
            {data.calendar.length === 0 ? (
              <p className="text-sm text-ink-faint">Nothing scheduled.</p>
            ) : (
              <TaskList tasks={data.calendar} />
            )}
          </div>
        )}

        {current.key === "projects" && (
          <div className="mt-3">
            {data.stalledParents.length > 0 ? (
              <>
                <p className="mb-3 text-sm text-amber-700">
                  {data.stalledParents.length} of {data.activeParents.length}{" "}
                  projects (tasks with subtasks) have no next action — open
                  each and decide the next step:
                </p>
                <TaskList tasks={data.stalledParents} />
              </>
            ) : (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-emerald-600">
                <Check size={15} /> All {data.activeParents.length} projects
                have a next action.
              </p>
            )}
          </div>
        )}

        {current.key === "waiting" && (
          <div className="mt-3">
            <p className="mb-3 text-sm text-ink-soft">
              Still waiting? Nudge them. Resolved? Check it off.
            </p>
            {data.waiting.length === 0 ? (
              <p className="text-sm text-ink-faint">
                Not waiting on anything.
              </p>
            ) : (
              <TaskList tasks={data.waiting} />
            )}
          </div>
        )}

        {current.key === "someday" && (
          <div className="mt-3">
            <p className="mb-3 text-sm text-ink-soft">
              Has anything become relevant? Open it and move it to Next — or
              delete what no longer excites you.
            </p>
            {data.someday.length === 0 ? (
              <p className="text-sm text-ink-faint">The someday list is empty.</p>
            ) : (
              <TaskList tasks={data.someday.slice(0, 10)} />
            )}
          </div>
        )}

        {current.key === "priorities" && (
          <div className="mt-3">
            <p className="mb-3 text-sm text-ink-soft">
              Your current top next actions by priority — adjust urgency and
              importance so the right things float to the top, then jot down
              your intent for the week.
            </p>
            <TaskList tasks={data.top} />
            <Textarea
              className="mt-4"
              rows={3}
              placeholder="This week I want to…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        )}

        <div className="mt-5 flex justify-between border-t border-line pt-4">
          <Button disabled={step === 0} onClick={() => setStep(step - 1)}>
            Back
          </Button>
          <Button variant="primary" onClick={completeStep}>
            {step === STEPS.length - 1 ? "Finish review" : "Step done — next"}
          </Button>
        </div>
      </div>
    </div>
  );
}
