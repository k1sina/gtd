"use client";

import type { Task } from "@gtd/shared";
import {
  AlarmClockOff,
  CalendarDays,
  Check,
  FolderPlus,
  Hourglass,
  LayoutList,
  Moon,
  Trash2,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  useCreateProject,
  useDeleteTask,
  useProjects,
  useUpdateTask,
} from "@/lib/data";
import { useSpace } from "@/lib/space-context";
import { PriorityPicker } from "./priority-picker";
import { Button, Input, Select } from "./ui";

/**
 * GTD clarify flow: walk through inbox items one at a time and decide what
 * each one is. The list shrinks as items get clarified. Render with
 * key={task.id} so state resets per item.
 */
export function ClarifyCard({ task }: { task: Task }) {
  const { currentSpace } = useSpace();
  const { data: projects = [] } = useProjects(currentSpace?.id);
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const createProject = useCreateProject();

  const [projectId, setProjectId] = useState(task.project_id ?? "");
  const [due, setDue] = useState("");
  const [waitingOn, setWaitingOn] = useState("");
  const [askWaiting, setAskWaiting] = useState(false);
  const [askDefer, setAskDefer] = useState(false);

  const base = {
    id: task.id,
    project_id: projectId || null,
    due_at: due ? new Date(due).toISOString() : task.due_at,
  };

  function deferUntil(date: Date) {
    updateTask.mutate({ ...base, status: "next", defer_until: date.toISOString() });
  }

  // Number keys trigger the outcome buttons (skipped while typing).
  const actionsRef = useRef<Record<string, () => void>>({});
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "SELECT" ||
        target.tagName === "TEXTAREA" ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey
      ) {
        return;
      }
      const action = actionsRef.current[e.key];
      if (action) {
        e.preventDefault();
        action();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="rounded-xl border border-line bg-surface p-5 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">
        Clarify
      </p>
      <h2 className="mt-1 text-lg font-medium">{task.title}</h2>
      {task.notes && <p className="mt-1 text-sm text-ink-soft">{task.notes}</p>}

      <div className="mt-4 grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1 text-xs text-ink-soft">
          Project
          <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">No project</option>
            {projects
              .filter((p) => p.status === "active")
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-soft">
          Due date (optional)
          <Input
            type="datetime-local"
            value={due}
            onChange={(e) => setDue(e.target.value)}
          />
        </label>
      </div>

      <div className="mt-4 rounded-lg border border-line bg-canvas/50 p-3">
        <PriorityPicker
          urgency={task.urgency}
          importance={task.importance}
          onChange={(p) => updateTask.mutate({ id: task.id, ...p })}
        />
      </div>

      {askWaiting ? (
        <div className="mt-4 flex items-end gap-2">
          <label className="flex flex-1 flex-col gap-1 text-xs text-ink-soft">
            Waiting on whom / what?
            <Input
              autoFocus
              value={waitingOn}
              onChange={(e) => setWaitingOn(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && waitingOn.trim()) {
                  updateTask.mutate({
                    ...base,
                    status: "waiting",
                    waiting_on: waitingOn.trim(),
                  });
                }
              }}
              placeholder="e.g. Sara — contract draft"
            />
          </label>
          <Button
            variant="primary"
            disabled={!waitingOn.trim()}
            onClick={() =>
              updateTask.mutate({
                ...base,
                status: "waiting",
                waiting_on: waitingOn.trim(),
              })
            }
          >
            Save
          </Button>
          <Button onClick={() => setAskWaiting(false)}>Cancel</Button>
        </div>
      ) : askDefer ? (
        <DeferPicker
          onPick={deferUntil}
          onCancel={() => setAskDefer(false)}
        />
      ) : (
        <ClarifyActions
          due={due}
          actionsRef={actionsRef}
          onDidIt={() =>
            updateTask.mutate({
              ...base,
              status: "done",
              completed_at: new Date().toISOString(),
            })
          }
          onNext={() =>
            updateTask.mutate({ ...base, status: due ? "scheduled" : "next" })
          }
          onWaiting={() => setAskWaiting(true)}
          onSomeday={() => updateTask.mutate({ ...base, status: "someday" })}
          onDefer={() => setAskDefer(true)}
          onProject={async () => {
            if (!currentSpace) return;
            const project = await createProject.mutateAsync({
              space_id: currentSpace.id,
              name: task.title,
              outcome: task.notes,
            });
            updateTask.mutate({
              id: task.id,
              project_id: project.id,
              title: `Define first next action for “${task.title}”`,
              status: "next",
            });
          }}
          onTrash={() => deleteTask.mutate(task.id)}
        />
      )}
      <p className="mt-3 text-[11px] text-ink-faint">
        <Check size={10} className="mr-1 inline" />
        Is it actionable? Under 2 minutes → do it now. Multiple steps → it’s a
        project. Not yours → waiting for. Not now → someday. Keys 1–6 pick an
        outcome.
      </p>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="ml-0.5 rounded border border-line bg-canvas px-1 text-[9px] font-normal text-ink-faint">
      {children}
    </kbd>
  );
}

function ClarifyActions({
  due,
  actionsRef,
  onDidIt,
  onNext,
  onWaiting,
  onSomeday,
  onDefer,
  onProject,
  onTrash,
}: {
  due: string;
  actionsRef: React.RefObject<Record<string, () => void>>;
  onDidIt: () => void;
  onNext: () => void;
  onWaiting: () => void;
  onSomeday: () => void;
  onDefer: () => void;
  onProject: () => void;
  onTrash: () => void;
}) {
  // Keep the number-key map in sync with the buttons below. Trash stays
  // mouse-only on purpose — it has no undo.
  actionsRef.current = {
    "1": onDidIt,
    "2": onNext,
    "3": onWaiting,
    "4": onSomeday,
    "5": onDefer,
    "6": onProject,
  };

  return (
    <div className="mt-5 flex flex-wrap gap-2">
      <Button
        variant="primary"
        size="sm"
        title="Under 2 minutes? Do it right away and mark it done."
        onClick={onDidIt}
      >
        <Zap size={13} /> Did it (2-min rule) <Kbd>1</Kbd>
      </Button>
      <Button size="sm" onClick={onNext}>
        {due ? <CalendarDays size={13} /> : <LayoutList size={13} />}
        {due ? "Schedule" : "Next action"} <Kbd>2</Kbd>
      </Button>
      <Button size="sm" onClick={onWaiting}>
        <Hourglass size={13} /> Waiting for… <Kbd>3</Kbd>
      </Button>
      <Button size="sm" onClick={onSomeday}>
        <Moon size={13} /> Someday <Kbd>4</Kbd>
      </Button>
      <Button size="sm" title="Hide it until a date, then resurface as a next action" onClick={onDefer}>
        <AlarmClockOff size={13} /> Defer… <Kbd>5</Kbd>
      </Button>
      <Button
        size="sm"
        title="Turn this into a project with its own next actions"
        onClick={onProject}
      >
        <FolderPlus size={13} /> It’s a project <Kbd>6</Kbd>
      </Button>
      <Button variant="danger" size="sm" onClick={onTrash}>
        <Trash2 size={13} /> Trash
      </Button>
    </div>
  );
}

function DeferPicker({
  onPick,
  onCancel,
}: {
  onPick: (date: Date) => void;
  onCancel: () => void;
}) {
  const [custom, setCustom] = useState("");
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  const nextWeek = new Date();
  // Next Monday (0 = Monday … 6 = Sunday).
  const iso = (nextWeek.getDay() + 6) % 7;
  nextWeek.setDate(nextWeek.getDate() + (7 - iso));
  nextWeek.setHours(9, 0, 0, 0);

  return (
    <div className="mt-4 flex flex-wrap items-end gap-2">
      <span className="w-full text-xs text-ink-soft sm:w-auto">Hide until:</span>
      <Button size="sm" onClick={() => onPick(tomorrow)}>
        Tomorrow
      </Button>
      <Button size="sm" onClick={() => onPick(nextWeek)}>
        Next week
      </Button>
      <Input
        type="datetime-local"
        value={custom}
        onChange={(e) => setCustom(e.target.value)}
        className="w-auto"
      />
      <Button
        variant="primary"
        size="sm"
        disabled={!custom}
        onClick={() => custom && onPick(new Date(custom))}
      >
        Defer
      </Button>
      <Button size="sm" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}
