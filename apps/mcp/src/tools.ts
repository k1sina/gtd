// Tool executors — ports of apps/web/src/lib/assistant-tools.ts (same names,
// same behavior). Keep the two implementations in sync.

import type {
  ExperienceFilter,
  Goal,
  Habit,
  HabitLog,
  LifeExperience,
  LifeHorizon,
  LifeHorizonInput,
  LifeValue,
} from "@gtd/shared";
import {
  experienceSummary,
  filterExperiences,
  habitSummary,
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

// ---------------------------------------------------------------------------
// Habits (space-scoped; the logs are personal)
// ---------------------------------------------------------------------------

/** Streaks look back up to a year, so the log fetch has to as well. */
function habitLogWindowStart(now: Date): string {
  const start = new Date(now);
  start.setDate(start.getDate() - 366);
  return toLogDate(start);
}

/** A log date is a day on the calendar, not an instant. */
function toLogDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function listHabits(ctx: ToolContext, input: ToolInput) {
  const now = new Date();
  const days = Math.min(90, Math.max(1, Number(input.days ?? 7)));

  let query = ctx.supabase
    .from("habits")
    .select("*")
    .eq("space_id", ctx.spaceId);
  if (!input.include_archived) query = query.is("archived_at", null);
  const { data: habits, error } = await query
    .order("sort_order")
    .order("created_at");
  if (error) throw new Error(error.message);

  const { data: logs, error: logError } = await ctx.supabase
    .from("habit_logs")
    .select("*")
    .gte("log_date", habitLogWindowStart(now));
  if (logError) throw new Error(logError.message);

  return ((habits ?? []) as Habit[]).map((habit) =>
    habitSummary(habit, (logs ?? []) as HabitLog[], now, days)
  );
}

async function saveHabit(ctx: ToolContext, input: ToolInput) {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.weekdays !== undefined) patch.weekdays = input.weekdays;
  // Archiving is the reversible way to retire a habit; the logs stay.
  if (input.archived !== undefined) {
    patch.archived_at = input.archived ? new Date().toISOString() : null;
  }
  if (!input.habit_id && !patch.name) {
    throw new Error("name is required when creating a habit");
  }

  const query = input.habit_id
    ? ctx.supabase
        .from("habits")
        .update(patch)
        .eq("id", input.habit_id)
        .eq("space_id", ctx.spaceId)
    : ctx.supabase
        .from("habits")
        .insert({ ...patch, space_id: ctx.spaceId, created_by: ctx.userId });
  const { data, error } = await query.select("*").single();
  if (error) throw new Error(error.message);

  const habit = data as Habit;
  return {
    saved: {
      id: habit.id,
      name: habit.name,
      weekdays: habit.weekdays,
      every_day: habit.weekdays.length === 0,
      archived: habit.archived_at != null,
    },
  };
}

async function logHabit(ctx: ToolContext, input: ToolInput) {
  const date = (input.date as string | undefined) ?? toLogDate(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`date must be YYYY-MM-DD, got "${date}"`);
  }
  const done = input.done !== false;

  if (done) {
    const { error } = await ctx.supabase.from("habit_logs").insert({
      habit_id: input.habit_id,
      user_id: ctx.userId,
      log_date: date,
    });
    // 23505 = already logged for that day, which is the state we wanted.
    if (error && error.code !== "23505") throw new Error(error.message);
  } else {
    const { error } = await ctx.supabase
      .from("habit_logs")
      .delete()
      .eq("habit_id", input.habit_id)
      .eq("user_id", ctx.userId)
      .eq("log_date", date);
    if (error) throw new Error(error.message);
  }
  return { habit_id: input.habit_id, date, done };
}

async function deleteHabit(ctx: ToolContext, input: ToolInput) {
  // Logs go with the habit via the FK's ON DELETE CASCADE.
  const { data, error } = await ctx.supabase
    .from("habits")
    .delete()
    .eq("id", input.habit_id)
    .eq("space_id", ctx.spaceId)
    .select("id, name")
    .single();
  if (error) throw new Error(error.message);
  return { deleted: data.name };
}

// ---------------------------------------------------------------------------
// Horizons: life values and quarterly goals (personal, never space-scoped)
// ---------------------------------------------------------------------------

async function listLifeValues(ctx: ToolContext) {
  const { data: values, error } = await ctx.supabase
    .from("life_values")
    .select("*")
    .order("sort_order")
    .order("created_at");
  if (error) throw new Error(error.message);

  const { data: goals, error: goalError } = await ctx.supabase
    .from("goals")
    .select("value_id, status");
  if (goalError) throw new Error(goalError.message);

  return ((values ?? []) as LifeValue[]).map((value) => ({
    id: value.id,
    name: value.name,
    description: value.description,
    active_goals: ((goals ?? []) as Goal[]).filter(
      (g) => g.value_id === value.id && g.status === "active"
    ).length,
  }));
}

async function saveLifeValue(ctx: ToolContext, input: ToolInput) {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) {
    patch.description = input.description === "" ? null : input.description;
  }
  if (!input.value_id && !patch.name) {
    throw new Error("name is required when creating a life value");
  }

  const query = input.value_id
    ? ctx.supabase.from("life_values").update(patch).eq("id", input.value_id)
    : ctx.supabase
        .from("life_values")
        .insert({ ...patch, user_id: ctx.userId });
  const { data, error } = await query.select("id, name, description").single();
  if (error) throw new Error(error.message);
  return { saved: data };
}

async function deleteLifeValue(ctx: ToolContext, input: ToolInput) {
  // Goals pointing at it survive — the FK is ON DELETE SET NULL.
  const { data, error } = await ctx.supabase
    .from("life_values")
    .delete()
    .eq("id", input.value_id)
    .select("id, name")
    .single();
  if (error) throw new Error(error.message);
  return { deleted: data.name };
}

async function listGoals(ctx: ToolContext, input: ToolInput) {
  const { data: goals, error } = await ctx.supabase
    .from("goals")
    .select("*")
    .order("year", { ascending: false })
    .order("quarter", { ascending: false })
    .order("sort_order");
  if (error) throw new Error(error.message);

  const { data: values, error: valueError } = await ctx.supabase
    .from("life_values")
    .select("id, name");
  if (valueError) throw new Error(valueError.message);

  const now = new Date();
  const current = {
    year: now.getFullYear(),
    quarter: Math.floor(now.getMonth() / 3) + 1,
  };
  const year = input.current_quarter ? current.year : (input.year as number | undefined);
  const quarter = input.current_quarter
    ? current.quarter
    : (input.quarter as number | undefined);

  const names = new Map(
    ((values ?? []) as LifeValue[]).map((v) => [v.id, v.name])
  );
  return ((goals ?? []) as Goal[])
    .filter((g) => year == null || g.year === year)
    .filter((g) => quarter == null || g.quarter === quarter)
    .filter((g) => !input.status || g.status === input.status)
    .filter((g) => !input.value_id || g.value_id === input.value_id)
    .map((g) => ({
      id: g.id,
      title: g.title,
      description: g.description,
      period: `Q${g.quarter} ${g.year}`,
      year: g.year,
      quarter: g.quarter,
      current: g.year === current.year && g.quarter === current.quarter,
      status: g.status,
      score: g.score,
      reflection: g.reflection,
      value_id: g.value_id,
      value: g.value_id ? (names.get(g.value_id) ?? null) : null,
    }));
}

async function saveGoal(ctx: ToolContext, input: ToolInput) {
  const patch: Record<string, unknown> = {};
  for (const key of ["title", "year", "quarter", "status", "score"]) {
    if (input[key] !== undefined) patch[key] = input[key];
  }
  for (const key of ["description", "reflection", "value_id"]) {
    if (input[key] !== undefined) patch[key] = input[key] === "" ? null : input[key];
  }

  if (!input.goal_id) {
    if (!patch.title) throw new Error("title is required when creating a goal");
    // A goal without a quarter is not a quarterly goal — default to this one.
    const now = new Date();
    patch.year ??= now.getFullYear();
    patch.quarter ??= Math.floor(now.getMonth() / 3) + 1;
  }

  const query = input.goal_id
    ? ctx.supabase.from("goals").update(patch).eq("id", input.goal_id)
    : ctx.supabase.from("goals").insert({ ...patch, user_id: ctx.userId });
  const { data, error } = await query
    .select("id, title, year, quarter, status, score, value_id")
    .single();
  if (error) throw new Error(error.message);
  return { saved: data };
}

async function deleteGoal(ctx: ToolContext, input: ToolInput) {
  const { data, error } = await ctx.supabase
    .from("goals")
    .delete()
    .eq("id", input.goal_id)
    .select("id, title")
    .single();
  if (error) throw new Error(error.message);
  return { deleted: data.title };
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
    case "list_habits":
      return listHabits(ctx, input);
    case "save_habit":
      return saveHabit(ctx, input);
    case "log_habit":
      return logHabit(ctx, input);
    case "delete_habit":
      return deleteHabit(ctx, input);
    case "list_life_values":
      return listLifeValues(ctx);
    case "save_life_value":
      return saveLifeValue(ctx, input);
    case "delete_life_value":
      return deleteLifeValue(ctx, input);
    case "list_goals":
      return listGoals(ctx, input);
    case "save_goal":
      return saveGoal(ctx, input);
    case "delete_goal":
      return deleteGoal(ctx, input);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
