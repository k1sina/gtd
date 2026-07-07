"use client";

import type { Task, TaskStatus } from "@gtd/shared";
import { formatRule, parseRule } from "@gtd/shared";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  useCreateTask,
  useDeleteTask,
  useProjects,
  useTasks,
  useUpdateTask,
} from "@/lib/data";
import { useSpace } from "@/lib/space-context";
import { PriorityPicker } from "./priority-picker";
import { TaskRow } from "./task-row";
import { Button, Dialog, Input, Select, Textarea } from "./ui";

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string): string | null {
  if (!value) return null;
  return new Date(value).toISOString();
}

const RECURRENCE_PRESETS: { label: string; value: string }[] = [
  { label: "Doesn't repeat", value: "" },
  { label: "Every day", value: "FREQ=DAILY;INTERVAL=1" },
  { label: "Every weekday", value: "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR" },
  { label: "Every week", value: "FREQ=WEEKLY;INTERVAL=1" },
  { label: "Every 2 weeks", value: "FREQ=WEEKLY;INTERVAL=2" },
  { label: "Every month", value: "FREQ=MONTHLY;INTERVAL=1" },
  { label: "Every year", value: "FREQ=YEARLY;INTERVAL=1" },
];

export function TaskDetail({
  task,
  onClose,
}: {
  task: Task | null;
  onClose: () => void;
}) {
  const { currentSpace } = useSpace();
  const { data: allTasks = [] } = useTasks(currentSpace?.id);
  const { data: projects = [] } = useProjects(currentSpace?.id);
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const createTask = useCreateTask();

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [newSubtask, setNewSubtask] = useState("");

  // The live version of the task from cache (mutations refresh it).
  const live = useMemo(
    () => allTasks.find((t) => t.id === task?.id) ?? task,
    [allTasks, task]
  );

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setNotes(task.notes ?? "");
      setNewSubtask("");
    }
  }, [task]);

  const subtasks = useMemo(
    () =>
      allTasks
        .filter((t) => t.parent_task_id === live?.id)
        .sort((a, b) => a.sort_order - b.sort_order),
    [allTasks, live?.id]
  );

  if (!live) return null;

  const patch = (fields: Partial<Task>) =>
    updateTask.mutate({ id: live.id, ...fields });

  const recurrencePreset =
    RECURRENCE_PRESETS.find(
      (p) =>
        p.value &&
        live.recurrence_rule &&
        formatRule(parseRule(live.recurrence_rule) ?? { freq: "DAILY", interval: 1 }) === p.value
    )?.value ?? (live.recurrence_rule ? "custom" : "");

  async function addSubtask() {
    if (!newSubtask.trim() || !currentSpace || !live) return;
    await createTask.mutateAsync({
      space_id: currentSpace.id,
      title: newSubtask.trim(),
      status: "next",
      parent_task_id: live.id,
      project_id: live.project_id,
      sort_order: subtasks.length,
    });
    setNewSubtask("");
  }

  return (
    <Dialog open={!!task} onClose={onClose} wide title="Task">
      <div className="thin-scroll max-h-[70vh] overflow-y-auto p-4">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() && title !== live.title && patch({ title: title.trim() })}
          className="w-full bg-transparent text-lg font-medium outline-none"
          placeholder="Task title"
        />

        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => (notes || null) !== live.notes && patch({ notes: notes || null })}
          placeholder="Notes…"
          rows={3}
          className="mt-3"
        />

        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4">
          <label className="flex flex-col gap-1 text-xs text-ink-soft">
            Status
            <Select
              value={live.status}
              onChange={(e) => {
                const status = e.target.value as TaskStatus;
                patch({
                  status,
                  completed_at: status === "done" ? new Date().toISOString() : null,
                });
              }}
            >
              <option value="inbox">Inbox</option>
              <option value="next">Next action</option>
              <option value="scheduled">Scheduled</option>
              <option value="waiting">Waiting for</option>
              <option value="someday">Someday / maybe</option>
              <option value="done">Done</option>
              <option value="cancelled">Cancelled</option>
            </Select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-ink-soft">
            Project
            <Select
              value={live.project_id ?? ""}
              onChange={(e) => patch({ project_id: e.target.value || null })}
            >
              <option value="">No project</option>
              {projects
                .filter((p) => p.status === "active" || p.id === live.project_id)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </Select>
          </label>

          {live.status === "waiting" && (
            <label className="col-span-2 flex flex-col gap-1 text-xs text-ink-soft">
              Waiting on (who / what)
              <Input
                defaultValue={live.waiting_on ?? ""}
                onBlur={(e) => patch({ waiting_on: e.target.value || null })}
                placeholder="e.g. Sara — reply about venue"
              />
            </label>
          )}

          <label className="flex flex-col gap-1 text-xs text-ink-soft">
            Due
            <Input
              type="datetime-local"
              value={toLocalInput(live.due_at)}
              onChange={(e) => patch({ due_at: fromLocalInput(e.target.value) })}
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-ink-soft">
            Defer until (hide before)
            <Input
              type="datetime-local"
              value={toLocalInput(live.defer_until)}
              onChange={(e) => patch({ defer_until: fromLocalInput(e.target.value) })}
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-ink-soft">
            Repeat
            <Select
              value={recurrencePreset}
              onChange={(e) =>
                patch({ recurrence_rule: e.target.value === "custom" ? live.recurrence_rule : e.target.value || null })
              }
            >
              {RECURRENCE_PRESETS.map((p) => (
                <option key={p.label} value={p.value}>
                  {p.label}
                </option>
              ))}
              {recurrencePreset === "custom" && (
                <option value="custom">Custom ({live.recurrence_rule})</option>
              )}
            </Select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-ink-soft">
            Energy
            <Select
              value={live.energy ?? ""}
              onChange={(e) => patch({ energy: (e.target.value || null) as Task["energy"] })}
            >
              <option value="">—</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </Select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-ink-soft">
            Estimate (minutes)
            <Input
              type="number"
              min={5}
              step={5}
              defaultValue={live.estimated_minutes ?? ""}
              onBlur={(e) =>
                patch({
                  estimated_minutes: e.target.value ? parseInt(e.target.value, 10) : null,
                })
              }
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-ink-soft">
            Context tags (comma separated)
            <Input
              defaultValue={live.context_tags.join(", ")}
              onBlur={(e) =>
                patch({
                  context_tags: e.target.value
                    .split(",")
                    .map((t) => t.trim().toLowerCase())
                    .filter(Boolean),
                })
              }
              placeholder="phone, home, errands"
            />
          </label>
        </div>

        <div className="mt-5 rounded-lg border border-line bg-canvas/50 p-3">
          <PriorityPicker
            urgency={live.urgency}
            importance={live.importance}
            onChange={(p) => patch(p)}
          />
        </div>

        {/* Subtasks */}
        {!live.parent_task_id && (
          <div className="mt-5">
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-faint">
              Subtasks
            </h3>
            <div className="flex flex-col">
              {subtasks.map((st) => (
                <TaskRow key={st.id} task={st} showProject={false} />
              ))}
            </div>
            <div className="mt-1 flex items-center gap-2">
              <Plus size={14} className="text-ink-faint" />
              <input
                value={newSubtask}
                onChange={(e) => setNewSubtask(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addSubtask()}
                placeholder="Add subtask and press Enter"
                className="h-8 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-faint"
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-line px-4 py-2.5">
        <Button
          variant="danger"
          size="sm"
          onClick={() => {
            deleteTask.mutate(live.id);
            onClose();
          }}
        >
          <Trash2 size={13} />
          Delete
        </Button>
        <Button size="sm" onClick={onClose}>
          Done
        </Button>
      </div>
    </Dialog>
  );
}
