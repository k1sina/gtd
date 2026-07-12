"use client";

import { describeRule, parseQuickAdd } from "@gtd/shared";
import {
  AlarmClock,
  CalendarDays,
  Flag,
  FolderKanban,
  Moon,
  RefreshCcw,
  Tag,
  Zap,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useCreateTask, useTasks } from "@/lib/data";
import { formatMinutes } from "@/lib/format";
import { useSpace } from "@/lib/space-context";
import { Badge, Dialog } from "./ui";

/** Mount only while open (`{open && <QuickAdd …/>}`) so state resets per use. */
export function QuickAdd({ onClose }: { onClose: () => void }) {
  const { currentSpace } = useSpace();
  const { data: allTasks = [] } = useTasks(currentSpace?.id);
  const createTask = useCreateTask();
  const [text, setText] = useState("");
  const [savedCount, setSavedCount] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => parseQuickAdd(text), [text]);

  // "#Renovation" files the capture as a subtask of that task — matching any
  // open top-level task is deliberate: that's how a task becomes a project.
  const matchedParent = useMemo(() => {
    if (!parsed.parentHint) return null;
    const hint = parsed.parentHint.toLowerCase();
    const candidates = allTasks.filter(
      (t) => !t.parent_task_id && !["done", "cancelled"].includes(t.status)
    );
    return (
      candidates.find((t) => t.title.toLowerCase() === hint) ??
      candidates.find((t) => t.title.toLowerCase().includes(hint)) ??
      null
    );
  }, [parsed.parentHint, allTasks]);

  async function save() {
    if (!currentSpace || !parsed.title.trim()) return;
    await createTask.mutateAsync({
      space_id: currentSpace.id,
      title: parsed.title.trim(),
      status: parsed.someday ? "someday" : "inbox",
      parent_task_id: matchedParent?.id ?? null,
      due_at: parsed.dueAt?.toISOString() ?? null,
      context_tags: parsed.tags,
      urgency: parsed.urgency ?? undefined,
      importance: parsed.importance ?? undefined,
      energy: parsed.energy,
      estimated_minutes: parsed.estimatedMinutes,
      recurrence_rule: parsed.recurrenceRule,
    });
    setText("");
    setSavedCount((c) => c + 1);
    inputRef.current?.focus();
  }

  return (
    <Dialog open onClose={onClose} wide>
      <div className="p-4">
        <input
          ref={inputRef}
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              save();
            }
          }}
          placeholder='Capture anything… e.g. "Call mom tomorrow 3pm @phone #Family !urgent"'
          className="w-full bg-transparent text-lg outline-none placeholder:text-ink-faint"
        />

        <div className="mt-3 flex min-h-6 flex-wrap items-center gap-1.5">
          {parsed.dueAt && (
            <Badge tone="amber">
              <CalendarDays size={11} />
              {parsed.dueAt.toLocaleDateString([], {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}{" "}
              {parsed.dueAt.toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
              })}
            </Badge>
          )}
          {parsed.recurrenceRule && (
            <Badge tone="blue">
              <RefreshCcw size={11} />
              {describeRule(parsed.recurrenceRule)}
            </Badge>
          )}
          {parsed.tags.map((t) => (
            <Badge key={t} tone="accent">
              <Tag size={11} />
              {t}
            </Badge>
          ))}
          {parsed.parentHint && (
            <Badge tone={matchedParent ? "green" : "neutral"}>
              <FolderKanban size={11} />
              {matchedParent
                ? `subtask of ${matchedParent.title}`
                : `${parsed.parentHint}?`}
            </Badge>
          )}
          {(parsed.urgency || parsed.importance) && (
            <Badge tone="red">
              <Flag size={11} />
              {parsed.urgency ? "urgent" : ""}
              {parsed.urgency && parsed.importance ? " + " : ""}
              {parsed.importance ? "important" : ""}
            </Badge>
          )}
          {parsed.energy && (
            <Badge tone="green">
              <Zap size={11} />
              {parsed.energy} energy
            </Badge>
          )}
          {parsed.estimatedMinutes && (
            <Badge tone="neutral">
              <AlarmClock size={11} />
              {formatMinutes(parsed.estimatedMinutes)}
            </Badge>
          )}
          {parsed.someday && (
            <Badge tone="neutral">
              <Moon size={11} />
              someday
            </Badge>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-xs text-ink-faint">
        <span>
          {savedCount > 0
            ? `${savedCount} captured — keep going`
            : "Enter to capture · Esc to close"}
        </span>
        <span>
          Syntax: date · @tag · #parent task · !urgent !important !someday ·
          ^low ^high · ~30m · every week
        </span>
      </div>
    </Dialog>
  );
}
