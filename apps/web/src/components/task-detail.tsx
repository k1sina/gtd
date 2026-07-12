"use client";

import type { Task, TaskStatus } from "@gtd/shared";
import {
  formatRule,
  isRatedPriority,
  parseRule,
  QUADRANT_LABELS,
  quadrant,
  reorderPatches,
} from "@gtd/shared";
import { Plus, Trash2, X } from "lucide-react";
import { useId, useMemo, useState } from "react";
import {
  useAddTaskComment,
  useCreateTask,
  useDeleteTask,
  useReorderTasks,
  useSpaceMembers,
  useTaskComments,
  useTasks,
  useUpdateTask,
} from "@/lib/data";
import { useSpace } from "@/lib/space-context";
import { PriorityMatrix } from "./priority-matrix";
import { SortableList } from "./sortable-list";
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

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const RECURRENCE_PRESETS: { label: string; value: string }[] = [
  { label: "Doesn't repeat", value: "" },
  { label: "Every day", value: "FREQ=DAILY;INTERVAL=1" },
  { label: "Every weekday", value: "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR" },
  { label: "Every week", value: "FREQ=WEEKLY;INTERVAL=1" },
  { label: "Every 2 weeks", value: "FREQ=WEEKLY;INTERVAL=2" },
  { label: "Every month", value: "FREQ=MONTHLY;INTERVAL=1" },
  { label: "Every year", value: "FREQ=YEARLY;INTERVAL=1" },
];

/** Mount with key={task.id} only while open so state resets per task. */
export function TaskDetail({
  task,
  onClose,
}: {
  task: Task;
  onClose: () => void;
}) {
  const { currentSpace } = useSpace();
  const { data: allTasks = [] } = useTasks(currentSpace?.id);
  const { data: members = [] } = useSpaceMembers(currentSpace?.id);
  const { data: comments = [] } = useTaskComments(task.id);
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const createTask = useCreateTask();
  const reorderTasks = useReorderTasks();
  const addComment = useAddTaskComment();

  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? "");
  const [outcome, setOutcome] = useState(task.outcome ?? "");
  const [newSubtask, setNewSubtask] = useState("");
  // Drill into a subtask (subtasks can hold subtasks of their own).
  const [drill, setDrill] = useState<Task | null>(null);
  const [newComment, setNewComment] = useState("");
  const isShared = !currentSpace?.is_personal && members.length > 0;

  // The live version of the task from cache (mutations refresh it).
  const live = useMemo(
    () => allTasks.find((t) => t.id === task.id) ?? task,
    [allTasks, task]
  );

  // Same order as the subtask surfacing walk (sort_order, then created_at).
  const subtasks = allTasks
    .filter((t) => t.parent_task_id === live.id)
    .sort(
      (a, b) =>
        a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)
    );

  // Every tag in the space, for tag-input suggestions.
  const allTags = useMemo(
    () => [...new Set(allTasks.flatMap((t) => t.context_tags))].sort(),
    [allTasks]
  );

  const patch = (fields: Partial<Task>) =>
    updateTask.mutate({ id: live.id, ...fields });

  const parsedRule = live.recurrence_rule ? parseRule(live.recurrence_rule) : null;
  const recurrencePreset =
    RECURRENCE_PRESETS.find(
      (p) => p.value && parsedRule && formatRule(parsedRule) === p.value
    )?.value ?? (live.recurrence_rule ? "custom" : "");

  async function addSubtask() {
    if (!newSubtask.trim() || !currentSpace || !live) return;
    await createTask.mutateAsync({
      space_id: currentSpace.id,
      title: newSubtask.trim(),
      status: "next",
      parent_task_id: live.id,
      sort_order: subtasks.length,
    });
    setNewSubtask("");
  }

  return (
    <Dialog open onClose={onClose} wide title="Task">
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

        {/* GTD: a task with subtasks is a project — give it an outcome. */}
        {(subtasks.length > 0 || live.outcome) && (
          <label className="mt-3 flex flex-col gap-1 text-xs text-ink-soft">
            Outcome — what does done look like?
            <Input
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              onBlur={() =>
                (outcome.trim() || null) !== live.outcome &&
                patch({ outcome: outcome.trim() || null })
              }
              placeholder="e.g. Kitchen fully usable again"
            />
          </label>
        )}

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

          {isShared && (
            <label className="flex flex-col gap-1 text-xs text-ink-soft">
              Assigned to
              <Select
                value={live.assigned_to ?? ""}
                onChange={(e) => patch({ assigned_to: e.target.value || null })}
              >
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.profile?.display_name || m.profile?.email}
                  </option>
                ))}
              </Select>
            </label>
          )}

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
            {parsedRule?.freq === "WEEKLY" && (
              <span className="mt-1 flex items-center gap-1">
                {WEEKDAY_LABELS.map((d, i) => {
                  const days = parsedRule.byday ?? [];
                  const on = days.includes(i);
                  return (
                    <button
                      key={i}
                      type="button"
                      title={d}
                      onClick={() => {
                        const next = on
                          ? days.filter((x) => x !== i)
                          : [...days, i].sort();
                        patch({
                          recurrence_rule: formatRule({
                            ...parsedRule,
                            byday: next.length > 0 ? next : undefined,
                          }),
                        });
                      }}
                      className={
                        "h-6 w-6 rounded-full border text-[10px] font-medium cursor-pointer " +
                        (on
                          ? "border-accent bg-accent text-white"
                          : "border-line bg-surface text-ink-soft hover:border-accent")
                      }
                    >
                      {d[0]}
                    </button>
                  );
                })}
                {(parsedRule.byday ?? []).length === 0 && (
                  <span className="ml-1 text-[10px] text-ink-faint">
                    on the due date&apos;s weekday
                  </span>
                )}
              </span>
            )}
          </label>

          <div className="flex flex-col gap-1 text-xs text-ink-soft">
            Energy
            <div className="flex h-9 items-center gap-1">
              {(["low", "medium", "high"] as const).map((e) => (
                <button
                  key={e}
                  type="button"
                  title={
                    live.energy === e ? "Click again to clear" : `${e} energy`
                  }
                  onClick={() =>
                    patch({ energy: live.energy === e ? null : e })
                  }
                  className={
                    "flex-1 rounded-md border px-2 py-1.5 text-xs capitalize cursor-pointer " +
                    (live.energy === e
                      ? "border-accent bg-accent-soft font-medium text-accent"
                      : "border-line text-ink-soft hover:border-accent")
                  }
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

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

          <div className="col-span-2 flex flex-col gap-1 text-xs text-ink-soft">
            Context tags
            <TagEditor
              tags={live.context_tags}
              suggestions={allTags}
              onChange={(context_tags) => patch({ context_tags })}
            />
          </div>
        </div>

        {/* Collapsed by default; a deliberate rating (≠ the 2,2 default) opens it. */}
        <details
          open={isRatedPriority(live.urgency, live.importance)}
          className="mt-5 rounded-lg border border-line bg-canvas/50"
        >
          <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-ink-soft">
            Priority
            {isRatedPriority(live.urgency, live.importance) && (
              <span className="ml-2 text-ink-faint">
                {QUADRANT_LABELS[quadrant(live.urgency, live.importance)]}
              </span>
            )}
          </summary>
          <div className="px-3 pb-3">
            <PriorityMatrix
              urgency={live.urgency}
              importance={live.importance}
              onChange={(p) => patch(p)}
            />
          </div>
        </details>

        {/* Comments (shared spaces) */}
        {isShared && (
          <div className="mt-5">
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-faint">
              Comments
            </h3>
            <div className="flex flex-col gap-2">
              {comments.map((c) => (
                <div key={c.id} className="rounded-lg bg-canvas/70 px-3 py-2">
                  <p className="text-[11px] font-medium text-ink-soft">
                    {c.profile?.display_name || "Someone"}
                    <span className="ml-2 font-normal text-ink-faint">
                      {new Date(c.created_at).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  </p>
                  <p className="mt-0.5 text-sm">{c.body}</p>
                </div>
              ))}
            </div>
            <input
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newComment.trim() && currentSpace) {
                  addComment.mutate({
                    taskId: live.id,
                    spaceId: currentSpace.id,
                    body: newComment.trim(),
                  });
                  setNewComment("");
                }
              }}
              placeholder="Add a comment and press Enter"
              className="mt-2 h-9 w-full rounded-md border border-line bg-surface px-3 text-sm outline-none placeholder:text-ink-faint focus:border-accent"
            />
          </div>
        )}

        {/* Subtasks — any task can hold them (a task with subtasks IS a project) */}
        <div className="mt-5">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-faint">
            Subtasks
          </h3>
          <SortableList
            items={subtasks}
            onMove={(from, to) => {
              const patches = reorderPatches(subtasks, from, to);
              if (patches.length > 0 && currentSpace) {
                reorderTasks.mutate({ spaceId: currentSpace.id, patches });
              }
            }}
          >
            {(st) => <TaskRow key={st.id} task={st} onOpen={setDrill} />}
          </SortableList>
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
      </div>

      <div className="flex items-center justify-between border-t border-line px-4 py-2.5">
        <Button
          variant="danger"
          size="sm"
          onClick={() => {
            const message =
              subtasks.length > 0
                ? `Delete this task and its ${subtasks.length} subtask${subtasks.length === 1 ? "" : "s"}?`
                : "Delete this task?";
            if (!confirm(message)) return;
            deleteTask.mutate(live.id);
            onClose();
          }}
        >
          <Trash2 size={13} />
          Delete
        </Button>
        <Button size="sm" onClick={onClose}>
          Close
        </Button>
      </div>

      {drill && (
        <TaskDetail key={drill.id} task={drill} onClose={() => setDrill(null)} />
      )}
    </Dialog>
  );
}

/**
 * Tag chips with ✕-to-remove plus an add-input that suggests the space's
 * existing tags (datalist) — replaces the old comma-separated text field.
 * Enter or comma commits; Backspace on an empty input removes the last tag.
 */
function TagEditor({
  tags,
  suggestions,
  onChange,
}: {
  tags: string[];
  suggestions: string[];
  onChange: (tags: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const listId = useId();

  function add(raw: string) {
    const tag = raw.trim().toLowerCase().replace(/^@/, "");
    if (tag && !tags.includes(tag)) onChange([...tags, tag]);
    setDraft("");
  }

  return (
    <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1.5 focus-within:border-accent">
      {tags.map((t) => (
        <span
          key={t}
          className="flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent"
        >
          @{t}
          <button
            type="button"
            aria-label={`Remove tag ${t}`}
            onClick={() => onChange(tags.filter((x) => x !== t))}
            className="cursor-pointer rounded-full hover:bg-accent/20"
          >
            <X size={11} />
          </button>
        </span>
      ))}
      <input
        list={listId}
        value={draft}
        onChange={(e) => {
          // Selecting a datalist entry fires change with the full value.
          if (e.target.value.endsWith(",")) add(e.target.value.slice(0, -1));
          else setDraft(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && draft.trim()) {
            e.preventDefault();
            add(draft);
          } else if (e.key === "Backspace" && !draft && tags.length > 0) {
            onChange(tags.slice(0, -1));
          }
        }}
        onBlur={() => draft.trim() && add(draft)}
        placeholder={tags.length === 0 ? "phone, home, errands…" : "add…"}
        className="min-w-24 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-faint"
      />
      <datalist id={listId}>
        {suggestions
          .filter((s) => !tags.includes(s))
          .map((s) => (
            <option key={s} value={s} />
          ))}
      </datalist>
    </div>
  );
}
