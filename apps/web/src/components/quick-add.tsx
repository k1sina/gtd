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
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useCreateTask, useProjects } from "@/lib/data";
import { formatMinutes } from "@/lib/format";
import { useSpace } from "@/lib/space-context";
import { Badge, Dialog } from "./ui";

/** Mount only while open (`{open && <QuickAdd …/>}`) so state resets per use. */
export function QuickAdd({
  onClose,
  defaultProjectId,
}: {
  onClose: () => void;
  defaultProjectId?: string;
}) {
  const { currentSpace } = useSpace();
  const { data: projects = [] } = useProjects(currentSpace?.id);
  const createTask = useCreateTask();
  const [text, setText] = useState("");
  const [savedCount, setSavedCount] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => parseQuickAdd(text), [text]);

  const matchedProject = useMemo(() => {
    if (!parsed.projectHint) return null;
    const hint = parsed.projectHint.toLowerCase();
    return (
      projects.find((p) => p.name.toLowerCase() === hint) ??
      projects.find((p) => p.name.toLowerCase().includes(hint)) ??
      null
    );
  }, [parsed.projectHint, projects]);

  async function save() {
    if (!currentSpace || !parsed.title.trim()) return;
    await createTask.mutateAsync({
      space_id: currentSpace.id,
      title: parsed.title.trim(),
      status: parsed.someday ? "someday" : "inbox",
      project_id: matchedProject?.id ?? defaultProjectId ?? null,
      due_at: parsed.dueAt?.toISOString() ?? null,
      context_tags: parsed.tags,
      urgency: parsed.urgency ?? undefined,
      importance: parsed.importance ?? undefined,
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
          {parsed.projectHint && (
            <Badge tone={matchedProject ? "green" : "neutral"}>
              <FolderKanban size={11} />
              {matchedProject ? matchedProject.name : `${parsed.projectHint}?`}
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
          Syntax: date · @tag · #project · !urgent !important !someday · ~30m ·
          every week
        </span>
      </div>
    </Dialog>
  );
}
