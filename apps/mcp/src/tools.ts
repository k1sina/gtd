// Tool executors — ports of apps/web/src/lib/assistant-tools.ts (same names,
// same behavior). Keep the two implementations in sync.

import type {
  ExperienceFilter,
  LifeExperience,
  LifeHorizon,
  LifeHorizonInput,
} from "@gtd/shared";
import {
  experienceSummary,
  filterExperiences,
  isDeferred,
  isStalledParent,
  lifeProgress,
  nextOccurrenceInsert,
  priorityScore,
  quadrant,
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
  energy: string | null;
  context_tags: string[];
  waiting_on: string | null;
  recurrence_rule: string | null;
  outcome: string | null;
  parent_task_id: string | null;
  sort_order: number;
  created_at: string;
  notes: string | null;
}

/** Pure: narrow to one tree level, apply the due filter, rank by priority.
 * has_subtasks/stalled are computed against the full row set first. */
export function filterAndRankTasks(rows: TaskRow[], input: ToolInput, now: Date) {
  const openChildCounts = new Map<string, number>();
  for (const t of rows) {
    if (t.parent_task_id && !["done", "cancelled"].includes(t.status)) {
      openChildCounts.set(
        t.parent_task_id,
        (openChildCounts.get(t.parent_task_id) ?? 0) + 1
      );
    }
  }
  const nodes = rows.map((t) => ({
    ...t,
    status: t.status as import("@gtd/shared").TaskStatus,
  }));

  let tasks = input.parent_task_id
    ? nodes.filter((t) => t.parent_task_id === input.parent_task_id)
    : nodes.filter((t) => !t.parent_task_id);
  if (input.context_tag) {
    tasks = tasks.filter((t) => t.context_tags.includes(input.context_tag as string));
  }
  if (input.energy) {
    tasks = tasks.filter((t) => t.energy === input.energy);
  }
  if (input.due_within_days != null) {
    const cutoff = new Date(now.getTime() + Number(input.due_within_days) * 86400000);
    tasks = tasks.filter((t) => t.due_at && new Date(t.due_at) <= cutoff);
  }
  // Subtask listings follow the surfacing order (sort_order, created_at);
  // top-level listings stay ranked by leverage.
  const sorted = input.parent_task_id
    ? tasks.sort(
        (a, b) =>
          a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)
      )
    : tasks.sort(
        (a, b) =>
          priorityScore({ ...b, due_at: b.due_at ?? undefined }, now) -
          priorityScore({ ...a, due_at: a.due_at ?? undefined }, now)
      );

  return sorted
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
      energy: t.energy,
      tags: t.context_tags,
      waiting_on: t.waiting_on,
      recurring: t.recurrence_rule,
      outcome: t.outcome,
      has_subtasks: (openChildCounts.get(t.id) ?? 0) > 0,
      stalled: isStalledParent(t, nodes, now),
      sort_order: t.sort_order,
      notes: t.notes?.slice(0, 200) ?? null,
    }));
}

/** Pure: whitelist update fields; empty-string due/defer/parent clears the column. */
export function buildUpdatePatch(input: ToolInput): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const key of [
    "title",
    "notes",
    "outcome",
    "status",
    "urgency",
    "importance",
    "energy",
    "context_tags",
    "estimated_minutes",
    "waiting_on",
    "sort_order",
  ]) {
    if (input[key] !== undefined) patch[key] = input[key];
  }
  for (const key of ["due_at", "defer_until", "parent_task_id"]) {
    if (input[key] !== undefined) patch[key] = input[key] === "" ? null : input[key];
  }
  return patch;
}

async function listTasks(ctx: ToolContext, input: ToolInput) {
  let query = ctx.supabase
    .from("tasks")
    .select(
      "id, title, status, urgency, importance, due_at, defer_until, estimated_minutes, energy, context_tags, waiting_on, recurrence_rule, outcome, parent_task_id, sort_order, created_at, notes"
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
      outcome: input.outcome ?? null,
      parent_task_id: input.parent_task_id ?? null,
      due_at: input.due_at || null,
      urgency: input.urgency ?? 2,
      importance: input.importance ?? 2,
      energy: input.energy ?? null,
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

async function deleteTask(ctx: ToolContext, input: ToolInput) {
  // Subtasks go with the parent via the FK's ON DELETE CASCADE.
  const { data, error } = await ctx.supabase
    .from("tasks")
    .delete()
    .eq("id", input.task_id)
    .eq("space_id", ctx.spaceId)
    .select("id, title")
    .single();
  if (error) throw new Error(error.message);
  return { deleted: data.title };
}

// ---------------------------------------------------------------------------
// Lifetime map (personal horizon data — user-scoped, never space-scoped)
// ---------------------------------------------------------------------------

async function loadHorizon(ctx: ToolContext): Promise<{
  row: LifeHorizon | null;
  input: LifeHorizonInput | null;
}> {
  const { data, error } = await ctx.supabase
    .from("life_horizon")
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = (data as LifeHorizon | null) ?? null;
  return {
    row,
    input: row?.birth_date
      ? { birthDate: row.birth_date, lifeExpectancy: row.life_expectancy }
      : null,
  };
}

async function listLifeExperiences(ctx: ToolContext, input: ToolInput) {
  const { row, input: horizon } = await loadHorizon(ctx);
  const { data, error } = await ctx.supabase
    .from("life_experiences")
    .select("*")
    .limit(500);
  if (error) throw new Error(error.message);

  const now = new Date();
  const rows = filterExperiences(
    (data ?? []) as LifeExperience[],
    input as ExperienceFilter,
    horizon,
    now
  );
  return {
    horizon: horizon
      ? {
          birth_date: row!.birth_date,
          life_expectancy: row!.life_expectancy,
          ...lifeProgress(horizon, now),
        }
      : null,
    experiences: rows.map((e) => experienceSummary(e, horizon, now)),
  };
}

async function saveLifeExperience(ctx: ToolContext, input: ToolInput) {
  const patch: Record<string, unknown> = {};
  for (const key of ["title", "category", "target_age_start", "target_age_end"]) {
    if (input[key] !== undefined) patch[key] = input[key];
  }
  // Optional prose/links clear on an empty string.
  for (const key of ["notes", "with_whom", "value_id", "lived_on", "reflection"]) {
    if (input[key] !== undefined) patch[key] = input[key] === "" ? null : input[key];
  }
  if (input.unplace) {
    patch.target_age_start = null;
    patch.target_age_end = null;
  }
  // A window makes it planned, losing one makes it a dream again — unless the
  // caller says where it stands.
  if (input.status !== undefined) {
    patch.status = input.status;
  } else if (patch.target_age_start !== undefined || patch.target_age_end !== undefined) {
    patch.status =
      patch.target_age_start == null && patch.target_age_end == null
        ? "dream"
        : "planned";
  }
  if (patch.status === "lived" && input.lived_on === undefined) {
    patch.lived_on = new Date().toISOString().slice(0, 10);
  }

  if (!input.experience_id && !patch.title) {
    throw new Error("title is required when creating a life experience");
  }

  const query = input.experience_id
    ? ctx.supabase
        .from("life_experiences")
        .update(patch)
        .eq("id", input.experience_id)
    : ctx.supabase
        .from("life_experiences")
        .insert({ ...patch, user_id: ctx.userId });
  const { data, error } = await query.select("*").single();
  if (error) throw new Error(error.message);

  const { input: horizon } = await loadHorizon(ctx);
  return {
    saved: experienceSummary(data as LifeExperience, horizon, new Date()),
  };
}

async function deleteLifeExperience(ctx: ToolContext, input: ToolInput) {
  const { data, error } = await ctx.supabase
    .from("life_experiences")
    .delete()
    .eq("id", input.experience_id)
    .select("id, title")
    .single();
  if (error) throw new Error(error.message);
  return { deleted: data.title };
}

async function setLifeHorizon(ctx: ToolContext, input: ToolInput) {
  const patch: Record<string, unknown> = { user_id: ctx.userId };
  if (input.birth_date !== undefined) patch.birth_date = input.birth_date || null;
  if (input.life_expectancy !== undefined) patch.life_expectancy = input.life_expectancy;
  const { data, error } = await ctx.supabase
    .from("life_horizon")
    .upsert(patch, { onConflict: "user_id" })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  const row = data as LifeHorizon;
  return {
    birth_date: row.birth_date,
    life_expectancy: row.life_expectancy,
    ...(row.birth_date
      ? lifeProgress(
          { birthDate: row.birth_date, lifeExpectancy: row.life_expectancy },
          new Date()
        )
      : {}),
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
    case "delete_task":
      return deleteTask(ctx, input);
    case "list_life_experiences":
      return listLifeExperiences(ctx, input);
    case "save_life_experience":
      return saveLifeExperience(ctx, input);
    case "delete_life_experience":
      return deleteLifeExperience(ctx, input);
    case "set_life_horizon":
      return setLifeHorizon(ctx, input);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
