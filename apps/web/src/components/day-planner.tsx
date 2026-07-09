"use client";

import clsx from "clsx";
import { CalendarDays, Check, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  useCalendarEvents,
  useConfirmPlan,
  useDismissPlan,
  usePlanDay,
  useTasks,
  useTimeBlocks,
} from "@/lib/data";
import { toDateKey } from "@/lib/format";
import { useSpace } from "@/lib/space-context";
import { Button } from "./ui";

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

type PlanReason = "after_hours" | "no_candidates" | "no_free_slots";

const REASON_TEXT: Record<PlanReason, string> = {
  after_hours: "Your workday is over — nothing left to plan today.",
  no_candidates:
    "No open next actions to plan. Clarify your inbox or add tasks first.",
  no_free_slots:
    "No free slots left today — your calendar and blocks fill the day.",
};

/** Today's calendar events + suggested/confirmed focus blocks. */
export function DayPlanner() {
  const { currentSpace } = useSpace();
  const todayKey = toDateKey(new Date());
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = toDateKey(tomorrow);

  const { data: calendar } = useCalendarEvents(todayKey);
  const { data: blocks = [] } = useTimeBlocks(todayKey);
  const { data: tomorrowBlocks = [] } = useTimeBlocks(tomorrowKey);
  const { data: tasks = [] } = useTasks(currentSpace?.id);
  const planDay = usePlanDay();
  const confirmPlan = useConfirmPlan();
  const dismissPlan = useDismissPlan();
  const [notice, setNotice] = useState<PlanReason | null>(null);

  const taskTitle = useMemo(() => {
    const map = new Map(tasks.map((t) => [t.id, t.title]));
    return (id: string | null) => (id ? (map.get(id) ?? "Focus block") : "Focus block");
  }, [tasks]);

  function plan(dateKey: string) {
    if (!currentSpace) return;
    setNotice(null);
    planDay.mutate(
      { spaceId: currentSpace.id, dateKey },
      {
        onSuccess: (data) => {
          if (data.blocks?.length === 0 && data.reason) setNotice(data.reason);
        },
      }
    );
  }

  const suggested = blocks.filter((b) => b.status === "suggested");
  const planned = blocks.filter((b) => b.status !== "suggested");
  const tomorrowSuggested = tomorrowBlocks.filter((b) => b.status === "suggested");

  type Item = {
    id: string;
    start: string;
    end: string | null;
    label: string;
    kind: "event" | "block" | "suggestion";
  };
  const items: Item[] = [
    ...(calendar?.events ?? [])
      .filter((e) => !e.allDay && e.start)
      .map((e) => ({
        id: `ev-${e.id}`,
        start: e.start!,
        end: e.end,
        label: e.summary,
        kind: "event" as const,
      })),
    ...planned.map((b) => ({
      id: b.id,
      start: b.starts_at,
      end: b.ends_at,
      label: taskTitle(b.task_id),
      kind: "block" as const,
    })),
    ...suggested.map((b) => ({
      id: b.id,
      start: b.starts_at,
      end: b.ends_at,
      label: taskTitle(b.task_id),
      kind: "suggestion" as const,
    })),
  ].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  const showCard =
    items.length > 0 || calendar?.connected || planDay.isPending;

  return (
    <div className="mb-6 rounded-xl border border-line bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-faint">
          <CalendarDays size={13} /> Schedule
        </h2>
        <div className="flex items-center gap-2">
          {suggested.length > 0 ? (
            <>
              <Button
                size="sm"
                variant="primary"
                disabled={confirmPlan.isPending}
                onClick={() => confirmPlan.mutate(suggested.map((b) => b.id))}
              >
                <Check size={13} />
                Confirm {suggested.length} block{suggested.length === 1 ? "" : "s"}
                {calendar?.connected ? " → calendar" : ""}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => dismissPlan.mutate(todayKey)}
              >
                <X size={13} /> Dismiss
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              disabled={planDay.isPending || !currentSpace}
              onClick={() => plan(todayKey)}
            >
              <Sparkles size={13} />
              {planDay.isPending ? "Planning…" : "Plan my day"}
            </Button>
          )}
        </div>
      </div>

      {calendar?.reauthRequired && (
        <p className="mb-2 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          Google Calendar connection expired —{" "}
          <Link href="/settings" className="font-medium underline">
            reconnect in Settings
          </Link>{" "}
          to see events and sync blocks.
        </p>
      )}

      {notice && (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-line bg-canvas/60 px-2.5 py-1.5 text-xs text-ink-soft">
          <span>{REASON_TEXT[notice]}</span>
          {notice === "after_hours" && (
            <Button size="sm" onClick={() => plan(tomorrowKey)} disabled={planDay.isPending}>
              <Sparkles size={12} />
              Plan tomorrow instead
            </Button>
          )}
        </div>
      )}

      {!showCard || items.length === 0 ? (
        <p className="text-xs text-ink-faint">
          {calendar?.connected
            ? "Nothing on the calendar — hit “Plan my day” to block focus time for your top priorities."
            : (
              <>
                No calendar connected —{" "}
                <Link href="/settings" className="text-accent hover:underline">
                  connect Google Calendar
                </Link>{" "}
                to plan around your meetings, or plan with working hours only.
              </>
            )}
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((item) => (
            <li
              key={item.id}
              className={clsx(
                "flex items-center gap-2.5 rounded-md border px-2.5 py-1.5 text-sm",
                item.kind === "event" && "border-line bg-canvas/50",
                item.kind === "block" && "border-accent/30 bg-accent-soft/50",
                item.kind === "suggestion" &&
                  "border-dashed border-accent/50 bg-accent-soft/30"
              )}
            >
              <span className="w-28 shrink-0 text-xs tabular-nums text-ink-soft">
                {timeLabel(item.start)}
                {item.end ? ` – ${timeLabel(item.end)}` : ""}
              </span>
              <span className="truncate">
                {item.kind !== "event" && "⚡ "}
                {item.label}
              </span>
              {item.kind === "suggestion" && (
                <span className="ml-auto text-[10px] font-medium uppercase text-accent">
                  proposed
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {tomorrowBlocks.length > 0 && (
        <div className="mt-3 border-t border-line pt-2">
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
              Tomorrow
            </h3>
            {tomorrowSuggested.length > 0 && (
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="primary"
                  disabled={confirmPlan.isPending}
                  onClick={() => confirmPlan.mutate(tomorrowSuggested.map((b) => b.id))}
                >
                  <Check size={12} /> Confirm
                </Button>
                <Button size="sm" variant="ghost" onClick={() => dismissPlan.mutate(tomorrowKey)}>
                  <X size={12} /> Dismiss
                </Button>
              </div>
            )}
          </div>
          <ul className="flex flex-col gap-1">
            {tomorrowBlocks.map((b) => (
              <li
                key={b.id}
                className={clsx(
                  "flex items-center gap-2.5 rounded-md border px-2.5 py-1.5 text-sm",
                  b.status === "suggested"
                    ? "border-dashed border-accent/50 bg-accent-soft/30"
                    : "border-accent/30 bg-accent-soft/50"
                )}
              >
                <span className="w-28 shrink-0 text-xs tabular-nums text-ink-soft">
                  {timeLabel(b.starts_at)} – {timeLabel(b.ends_at)}
                </span>
                <span className="truncate">⚡ {taskTitle(b.task_id)}</span>
                {b.status === "suggested" && (
                  <span className="ml-auto text-[10px] font-medium uppercase text-accent">
                    proposed
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
