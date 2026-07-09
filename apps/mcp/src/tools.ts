// Tool executors — ports of apps/web/src/lib/assistant-tools.ts (same names,
// same behavior) minus the web-only Google Calendar integration. Keep the two
// implementations in sync.

import {
  DEFAULT_PLANNER_CONFIG,
  isDeferred,
  nextOccurrenceInsert,
  planDay,
  priorityScore,
  quadrant,
  type Interval,
  type PlannerConfig,
} from "@gtd/shared";
import type { ToolContext } from "./auth.js";

export type ToolInput = Record<string, unknown>;

interface TaskRow {
  id: string;
  title: string;
  status: string;
  urgency: number;
  importance: number;
  due_at: string | null;
  defer_until: string | null;
  estimated_minutes: number | null;
  context_tags: string[];
  waiting_on: string | null;
  recurrence_rule: string | null;
  project_id: string | null;
  parent_task_id: string | null;
  notes: string | null;
}

/** Pure: drop sub-tasks, apply due/project filters, rank by priority. */
export function filterAndRankTasks(rows: TaskRow[], input: ToolInput, now: Date) {
  let tasks = rows.filter((t) => !t.parent_task_id);
  if (input.due_within_days != null) {
    const cutoff = new Date(now.getTime() + Number(input.due_within_days) * 86400000);
    tasks = tasks.filter((t) => t.due_at && new Date(t.due_at) <= cutoff);
  }
  if (input.project_id) {
    tasks = tasks.filter((t) => t.project_id === input.project_id);
  }
  return tasks
    .sort(
      (a, b) =>
        priorityScore({ ...b, due_at: b.due_at ?? undefined }, now) -
        priorityScore({ ...a, due_at: a.due_at ?? undefined }, now)
    )
    .map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      urgency: t.urgency,
      importance: t.importance,
      quadrant: quadrant(t.urgency, t.importance),
      due_at: t.due_at,
      deferred: isDeferred({ ...t, defer_until: t.defer_until ?? undefined }, now),
      estimated_minutes: t.estimated_minutes,
      tags: t.context_tags,
      waiting_on: t.waiting_on,
      recurring: t.recurrence_rule,
      project_id: t.project_id,
      notes: t.notes?.slice(0, 200) ?? null,
    }));
}

/** Pure: whitelist update fields; empty-string due/defer clears the column. */
export function buildUpdatePatch(input: ToolInput): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const key of [
    "title",
    "notes",
    "status",
    "urgency",
    "importance",
    "project_id",
    "estimated_minutes",
    "waiting_on",
  ]) {
    if (input[key] !== undefined) patch[key] = input[key];
  }
  for (const key of ["due_at", "defer_until"]) {
    if (input[key] !== undefined) patch[key] = input[key] === "" ? null : input[key];
  }
  return patch;
}

async function listTasks(ctx: ToolContext, input: ToolInput) {
  let query = ctx.supabase
    .from("tasks")
    .select(
      "id, title, status, urgency, importance, due_at, defer_until, estimated_minutes, context_tags, waiting_on, recurrence_rule, project_id, parent_task_id, notes"
    )
    .eq("space_id", ctx.spaceId);

  const status = input.status as string | undefined;
  if (status === "all_open" || !status) {
    query = query.not("status", "in", '("done","cancelled")');
  } else {
    query = query.eq("status", status);
  }
  // Deterministic subset when the space exceeds the limit: nearest due
  // dates (overdue included) first, then newest.
  const { data, error } = await query
    .order("due_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);

  return filterAndRankTasks((data ?? []) as TaskRow[], input, new Date());
}

async function createTask(ctx: ToolContext, input: ToolInput) {
  const { data, error } = await ctx.supabase
    .from("tasks")
    .insert({
      space_id: ctx.spaceId,
      created_by: ctx.userId,
      title: input.title,
      status: input.status ?? "inbox",
      notes: input.notes ?? null,
      project_id: input.project_id ?? null,
      due_at: input.due_at || null,
      urgency: input.urgency ?? 2,
      importance: input.importance ?? 2,
      estimated_minutes: input.estimated_minutes ?? null,
      context_tags: input.context_tags ?? [],
      recurrence_rule: input.recurrence_rule ?? null,
      waiting_on: input.waiting_on ?? null,
    })
    .select("id, title, status")
    .single();
  if (error) throw new Error(error.message);
  return { created: data };
}

async function updateTask(ctx: ToolContext, input: ToolInput) {
  const { data, error } = await ctx.supabase
    .from("tasks")
    .update(buildUpdatePatch(input))
    .eq("id", input.task_id)
    .eq("space_id", ctx.spaceId)
    .select("id, title, status, urgency, importance, due_at")
    .single();
  if (error) throw new Error(error.message);
  return { updated: data };
}

async function completeTask(ctx: ToolContext, input: ToolInput) {
  const { data: task, error: fetchError } = await ctx.supabase
    .from("tasks")
    .select("*")
    .eq("id", input.task_id)
    .eq("space_id", ctx.spaceId)
    .single();
  if (fetchError) throw new Error(fetchError.message);

  const { error } = await ctx.supabase
    .from("tasks")
    .update({ status: "done", completed_at: new Date().toISOString() })
    .eq("id", task.id);
  if (error) throw new Error(error.message);

  const insert = nextOccurrenceInsert(task, ctx.userId);
  if (insert) {
    const { error: insertError } = await ctx.supabase.from("tasks").insert(insert);
    if (insertError) {
      throw new Error(
        `Task completed, but scheduling the next occurrence failed: ${insertError.message}`
      );
    }
  }
  return { completed: task.title, next_occurrence: insert?.due_at ?? null };
}

async function listProjects(ctx: ToolContext) {
  const [{ data: projects, error }, { data: tasks }] = await Promise.all([
    ctx.supabase
      .from("projects")
      .select("id, name, outcome, status")
      .eq("space_id", ctx.spaceId),
    ctx.supabase
      .from("tasks")
      .select("id, project_id, status, parent_task_id")
      .eq("space_id", ctx.spaceId),
  ]);
  if (error) throw new Error(error.message);

  return (projects ?? []).map((p) => {
    const projectTasks = (tasks ?? []).filter(
      (t) => t.project_id === p.id && !t.parent_task_id
    );
    const open = projectTasks.filter(
      (t) => !["done", "cancelled"].includes(t.status)
    );
    return {
      id: p.id,
      name: p.name,
      outcome: p.outcome,
      status: p.status,
      open_tasks: open.length,
      done_tasks: projectTasks.length - open.length,
      stalled: p.status === "active" && !open.some((t) => t.status === "next"),
    };
  });
}

async function createProject(ctx: ToolContext, input: ToolInput) {
  const { data, error } = await ctx.supabase
    .from("projects")
    .insert({
      space_id: ctx.spaceId,
      name: input.name,
      outcome: input.outcome ?? null,
    })
    .select("id, name")
    .single();
  if (error) throw new Error(error.message);
  return { created: data };
}

async function planToday(ctx: ToolContext) {
  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  // Planner settings live on the user's calendar account row (if any).
  const { data: accounts } = await ctx.supabase
    .from("calendar_accounts")
    .select("settings")
    .eq("user_id", ctx.userId)
    .limit(1);
  const config: PlannerConfig = {
    ...DEFAULT_PLANNER_CONFIG,
    ...((accounts?.[0]?.settings as Partial<PlannerConfig> | undefined) ?? {}),
  };

  // No direct Google access from here (the OAuth tokens are managed by the
  // web app) — treat already-confirmed/synced blocks for today as busy.
  const { data: existing } = await ctx.supabase
    .from("time_blocks")
    .select("starts_at, ends_at")
    .eq("user_id", ctx.userId)
    .in("status", ["confirmed", "synced"])
    .gte("starts_at", dayStart.toISOString())
    .lt("starts_at", dayEnd.toISOString());
  const busy: Interval[] = (existing ?? []).map((b) => ({
    start: new Date(b.starts_at),
    end: new Date(b.ends_at),
  }));

  const { data: tasks } = await ctx.supabase
    .from("tasks")
    .select(
      "id, title, urgency, importance, due_at, defer_until, estimated_minutes, parent_task_id"
    )
    .eq("space_id", ctx.spaceId)
    .in("status", ["next", "scheduled"]);

  const candidates = (tasks ?? [])
    .filter((t) => !t.parent_task_id && !isDeferred(t, now))
    .map((t) => ({
      id: t.id,
      title: t.title,
      urgency: t.urgency,
      importance: t.importance,
      due_at: t.due_at,
      estimated_minutes: t.estimated_minutes,
    }));

  const blocks = planDay(candidates, busy, dayStart, config, now);

  // Store as suggestions so the Today view shows them for confirmation.
  await ctx.supabase
    .from("time_blocks")
    .delete()
    .eq("status", "suggested")
    .gte("starts_at", dayStart.toISOString())
    .lt("starts_at", dayEnd.toISOString());
  if (blocks.length > 0) {
    await ctx.supabase.from("time_blocks").insert(
      blocks.map((b) => ({
        user_id: ctx.userId,
        task_id: b.taskId,
        starts_at: b.start.toISOString(),
        ends_at: b.end.toISOString(),
        status: "suggested",
      }))
    );
  }

  return {
    calendar_connected: false,
    proposed_blocks: blocks.map((b) => ({
      task: b.title,
      start: b.start.toISOString(),
      end: b.end.toISOString(),
    })),
    note: "Blocks are saved as suggestions — confirm them on the web app's Today view. Busy time comes from already-confirmed blocks, not live calendar events.",
  };
}

export async function executeTool(
  name: string,
  input: ToolInput,
  ctx: ToolContext
): Promise<unknown> {
  switch (name) {
    case "list_tasks":
      return listTasks(ctx, input);
    case "create_task":
      return createTask(ctx, input);
    case "update_task":
      return updateTask(ctx, input);
    case "complete_task":
      return completeTask(ctx, input);
    case "list_projects":
      return listProjects(ctx);
    case "create_project":
      return createProject(ctx, input);
    case "plan_day":
      return planToday(ctx);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
