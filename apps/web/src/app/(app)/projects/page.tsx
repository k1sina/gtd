"use client";

import type { Project } from "@gtd/shared";
import clsx from "clsx";
import { FolderKanban, Plus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/task-list";
import { Button, Dialog, EmptyState, Input, Select } from "@/components/ui";
import {
  useAreas,
  useCreateArea,
  useCreateProject,
  useProjects,
  useTasks,
} from "@/lib/data";
import { useSpace } from "@/lib/space-context";

function ProjectCard({
  project,
  taskStats,
}: {
  project: Project;
  taskStats: { open: number; done: number; next: number };
}) {
  const total = taskStats.open + taskStats.done;
  const pct = total > 0 ? Math.round((taskStats.done / total) * 100) : 0;
  // GTD: every active project needs a next action, or it silently stalls.
  const stalled = project.status === "active" && taskStats.next === 0;
  return (
    <Link
      href={`/projects/${project.id}`}
      className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4 transition-shadow hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium leading-snug">{project.name}</h3>
        {stalled && (
          <span
            title="No next action — decide the next step"
            className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-600"
          >
            stalled
          </span>
        )}
        {project.status !== "active" && (
          <span className="rounded-full bg-ink/5 px-2 py-0.5 text-[10px] text-ink-soft">
            {project.status.replace("_", " ")}
          </span>
        )}
      </div>
      {project.outcome && (
        <p className="line-clamp-2 text-xs text-ink-soft">{project.outcome}</p>
      )}
      <div className="mt-auto flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/5">
          <div
            className={clsx(
              "h-full rounded-full",
              pct === 100 ? "bg-emerald-500" : "bg-accent"
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-[11px] text-ink-faint">
          {taskStats.done}/{total}
        </span>
      </div>
    </Link>
  );
}

export default function ProjectsPage() {
  const { currentSpace } = useSpace();
  const { data: projects = [] } = useProjects(currentSpace?.id);
  const { data: areas = [] } = useAreas(currentSpace?.id);
  const { data: tasks = [] } = useTasks(currentSpace?.id);
  const createProject = useCreateProject();
  const createArea = useCreateArea();

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [outcome, setOutcome] = useState("");
  const [areaId, setAreaId] = useState("");
  const [newAreaName, setNewAreaName] = useState("");

  const statsByProject = useMemo(() => {
    const stats = new Map<string, { open: number; done: number; next: number }>();
    for (const t of tasks) {
      if (!t.project_id || t.parent_task_id) continue;
      const s = stats.get(t.project_id) ?? { open: 0, done: 0, next: 0 };
      if (t.status === "done") s.done += 1;
      else if (t.status !== "cancelled") {
        s.open += 1;
        if (t.status === "next") s.next += 1;
      }
      stats.set(t.project_id, s);
    }
    return stats;
  }, [tasks]);

  const active = projects.filter((p) => p.status === "active");
  const other = projects.filter((p) => p.status !== "active");

  const areaName = (id: string | null) =>
    areas.find((a) => a.id === id)?.name ?? null;

  const grouped = useMemo(() => {
    const groups = new Map<string, Project[]>();
    for (const p of active) {
      const key = areaName(p.area_id) ?? "No area";
      groups.set(key, [...(groups.get(key) ?? []), p]);
    }
    return [...groups.entries()].sort(([a], [b]) =>
      a === "No area" ? 1 : b === "No area" ? -1 : a.localeCompare(b)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, areas]);

  async function submit() {
    if (!currentSpace || !name.trim()) return;
    let finalAreaId: string | null = areaId || null;
    if (areaId === "__new__" && newAreaName.trim()) {
      const area = await createArea.mutateAsync({
        space_id: currentSpace.id,
        name: newAreaName.trim(),
      });
      finalAreaId = area.id;
    } else if (areaId === "__new__") {
      finalAreaId = null;
    }
    await createProject.mutateAsync({
      space_id: currentSpace.id,
      name: name.trim(),
      outcome: outcome.trim() || null,
      area_id: finalAreaId,
    });
    setCreating(false);
    setName("");
    setOutcome("");
    setAreaId("");
    setNewAreaName("");
  }

  return (
    <div>
      <PageHeader
        title="Projects"
        subtitle="Any outcome that takes more than one action"
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus size={15} /> New project
          </Button>
        }
      />

      {projects.length === 0 ? (
        <EmptyState
          icon={<FolderKanban size={22} />}
          title="No projects yet"
          hint="Anything that needs more than one step is a project in GTD."
          action={
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus size={15} /> Create your first project
            </Button>
          }
        />
      ) : (
        <>
          {grouped.map(([area, list]) => (
            <section key={area} className="mb-6">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">
                {area}
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {list.map((p) => (
                  <ProjectCard
                    key={p.id}
                    project={p}
                    taskStats={statsByProject.get(p.id) ?? { open: 0, done: 0, next: 0 }}
                  />
                ))}
              </div>
            </section>
          ))}
          {other.length > 0 && (
            <section className="mb-6">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">
                Someday · on hold · finished
              </h2>
              <div className="grid grid-cols-1 gap-3 opacity-70 sm:grid-cols-2">
                {other.map((p) => (
                  <ProjectCard
                    key={p.id}
                    project={p}
                    taskStats={statsByProject.get(p.id) ?? { open: 0, done: 0, next: 0 }}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <Dialog open={creating} onClose={() => setCreating(false)} title="New project">
        <div className="flex flex-col gap-3 p-4">
          <Input
            autoFocus
            placeholder="Project name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
          <Input
            placeholder="Desired outcome — what does done look like?"
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
          />
          <Select value={areaId} onChange={(e) => setAreaId(e.target.value)}>
            <option value="">No area of focus</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
            <option value="__new__">+ New area…</option>
          </Select>
          {areaId === "__new__" && (
            <Input
              placeholder="Area name (e.g. Health, Family, Work)"
              value={newAreaName}
              onChange={(e) => setNewAreaName(e.target.value)}
            />
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-4 py-2.5">
          <Button onClick={() => setCreating(false)}>Cancel</Button>
          <Button variant="primary" disabled={!name.trim()} onClick={submit}>
            Create project
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
