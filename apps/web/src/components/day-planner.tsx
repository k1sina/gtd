"use client";

import clsx from "clsx";
import { CalendarDays, Check, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
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

/** Today's calendar events + suggested/confirmed focus blocks. */
export function DayPlanner() {
  const { currentSpace } = useSpace();
  const todayKey = toDateKey(new Date());
  const { data: calendar } = useCalendarEvents(todayKey);
  const { data: blocks = [] } = useTimeBlocks(todayKey);
  const { data: tasks = [] } = useTasks(currentSpace?.id);
  const planDay = usePlanDay();
  const confirmPlan = useConfirmPlan();
  const dismissPlan = useDismissPlan();

  const taskTitle = useMemo(() => {
    const map = new Map(tasks.map((t) => [t.id, t.title]));
    return (id: string | null) => (id ? (map.get(id) ?? "Focus block") : "Focus block");
  }, [tasks]);

  const suggested = blocks.filter((b) => b.status === "suggested");
  const planned = blocks.filter((b) => b.status !== "suggested");

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
              onClick={() =>
                currentSpace &&
                planDay.mutate({ spaceId: currentSpace.id, dateKey: todayKey })
              }
            >
              <Sparkles size={13} />
              {planDay.isPending ? "Planning…" : "Plan my day"}
            </Button>
          )}
        </div>
      </div>

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
    </div>
  );
}
