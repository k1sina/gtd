"use client";

import type { ProjectStatus, Task } from "@gtd/shared";
import { byPriority } from "@gtd/shared";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useMemo, useState } from "react";
import { TaskDetail } from "@/components/task-detail";
import { TaskRow } from "@/components/task-row";
import { Button, Input, Select, Textarea } from "@/components/ui";
import {
  useCreateTask,
  useDeleteProject,
  useProjects,
  useTasks,
  useUpdateProject,
} from "@/lib/data";
import { useSpace } from "@/lib/space-context";

export default function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { currentSpace } = useSpace();
  const { data: projects = [] } = useProjects(currentSpace?.id);
  const { data: tasks = [] } = useTasks(currentSpace?.id);
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();
  const createTask = useCreateTask();

  const [selected, setSelected] = useState<Task | null>(null);
  const [newTask, setNewTask] = useState("");

  const project = projects.find((p) => p.id === id);

  const { open, done } = useMemo(() => {
    const projectTasks = tasks.filter(
      (t) => t.project_id === id && !t.parent_task_id
    );
    return {
      open: projectTasks
        .filter((t) => !["done", "cancelled"].includes(t.status))
        .sort(byPriority()),
      done: projectTasks
        .filter((t) => t.status === "done")
        .sort(
          (a, b) =>
            new Date(b.completed_at ?? 0).getTime() -
            new Date(a.completed_at ?? 0).getTime()
        ),
    };
  }, [tasks, id]);

  const subtasksOf = (taskId: string) =>
    tasks
      .filter((t) => t.parent_task_id === taskId)
      .sort((a, b) => a.sort_order - b.sort_order);

  if (!project) {
    return (
      <div>
        <Link href="/projects" className="text-sm text-accent hover:underline">
          ← Back to projects
        </Link>
        <p className="mt-6 text-sm text-ink-soft">Project not found.</p>
      </div>
    );
  }

  async function addTask() {
    if (!newTask.trim() || !currentSpace) return;
    await createTask.mutateAsync({
      space_id: currentSpace.id,
      title: newTask.trim(),
      status: "next",
      project_id: id,
      sort_order: open.length,
    });
    setNewTask("");
  }

  const hasNextAction = open.some((t) => t.status === "next");

  return (
    <div>
      <Link
        href="/projects"
        className="mb-4 inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink"
      >
        <ArrowLeft size={14} /> Projects
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex-1">
          <input
            key={project.id + project.name}
            defaultValue={project.name}
            onBlur={(e) =>
              e.target.value.trim() &&
              e.target.value !== project.name &&
              updateProject.mutate({ id, name: e.target.value.trim() })
            }
            className="w-full bg-transparent text-xl font-semibold outline-none"
          />
          <Textarea
            key={project.id + (project.outcome ?? "")}
            defaultValue={project.outcome ?? ""}
            placeholder="Desired outcome — what does done look like?"
            rows={1}
            onBlur={(e) =>
              (e.target.value || null) !== project.outcome &&
              updateProject.mutate({ id, outcome: e.target.value || null })
            }
            className="mt-1 resize-none border-none bg-transparent px-0 py-0 text-sm text-ink-soft focus:ring-0"
          />
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={project.status}
            onChange={(e) =>
              updateProject.mutate({
                id,
                status: e.target.value as ProjectStatus,
                completed_at:
                  e.target.value === "completed" ? new Date().toISOString() : null,
              })
            }
          >
            <option value="active">Active</option>
            <option value="someday">Someday</option>
            <option value="on_hold">On hold</option>
            <option value="completed">Completed</option>
            <option value="archived">Archived</option>
          </Select>
          <Button
            variant="danger"
            size="sm"
            title="Delete project and its tasks"
            onClick={() => {
              if (confirm("Delete this project and all its tasks?")) {
                deleteProject.mutate(id);
                router.push("/projects");
              }
            }}
          >
            <Trash2 size={13} />
          </Button>
        </div>
      </div>

      {!hasNextAction && project.status === "active" && (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          This project has no next action — every active project needs one.
        </p>
      )}

      <div className="mb-4 flex items-center gap-2 rounded-lg border border-dashed border-line px-3">
        <Plus size={15} className="text-ink-faint" />
        <input
          value={newTask}
          onChange={(e) => setNewTask(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addTask()}
          placeholder="Add task to this project…"
          className="h-10 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-faint"
        />
      </div>

      <div className="flex flex-col gap-0.5">
        {open.map((task) => (
          <div key={task.id}>
            <TaskRow task={task} showProject={false} onOpen={setSelected} />
            {subtasksOf(task.id).map((st) => (
              <TaskRow
                key={st.id}
                task={st}
                showProject={false}
                onOpen={setSelected}
                indent
              />
            ))}
          </div>
        ))}
      </div>

      {done.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">
            Completed · {done.length}
          </h2>
          <div className="flex flex-col gap-0.5 opacity-70">
            {done.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                showProject={false}
                onOpen={setSelected}
              />
            ))}
          </div>
        </section>
      )}

      <TaskDetail task={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
