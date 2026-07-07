"use client";

import type { Task } from "@gtd/shared";
import {
  CalendarDays,
  Check,
  FolderPlus,
  Hourglass,
  LayoutList,
  Moon,
  Trash2,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
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
 * each one is. The list shrinks as items get clarified.
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

  useEffect(() => {
    setProjectId(task.project_id ?? "");
    setDue("");
    setWaitingOn("");
    setAskWaiting(false);
  }, [task.id, task.project_id]);

  const base = {
    id: task.id,
    project_id: projectId || null,
    due_at: due ? new Date(due).toISOString() : task.due_at,
  };

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
      ) : (
        <div className="mt-5 flex flex-wrap gap-2">
          <Button
            variant="primary"
            size="sm"
            title="Under 2 minutes? Do it right away and mark it done."
            onClick={() =>
              updateTask.mutate({
                ...base,
                status: "done",
                completed_at: new Date().toISOString(),
              })
            }
          >
            <Zap size={13} /> Did it (2-min rule)
          </Button>
          <Button
            size="sm"
            onClick={() =>
              updateTask.mutate({
                ...base,
                status: due ? "scheduled" : "next",
              })
            }
          >
            {due ? <CalendarDays size={13} /> : <LayoutList size={13} />}
            {due ? "Schedule" : "Next action"}
          </Button>
          <Button size="sm" onClick={() => setAskWaiting(true)}>
            <Hourglass size={13} /> Waiting for…
          </Button>
          <Button
            size="sm"
            onClick={() => updateTask.mutate({ ...base, status: "someday" })}
          >
            <Moon size={13} /> Someday
          </Button>
          <Button
            size="sm"
            title="Turn this into a project with its own next actions"
            onClick={async () => {
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
          >
            <FolderPlus size={13} /> It’s a project
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => deleteTask.mutate(task.id)}
          >
            <Trash2 size={13} /> Trash
          </Button>
        </div>
      )}
      <p className="mt-3 text-[11px] text-ink-faint">
        <Check size={10} className="mr-1 inline" />
        Is it actionable? Under 2 minutes → do it now. Multiple steps → it’s a
        project. Not yours → waiting for. Not now → someday.
      </p>
    </div>
  );
}
