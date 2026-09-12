// Tools the AI assistant can call. Every tool executes against the signed-in
// user's Supabase client, so row-level security scopes all reads and writes.

import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
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

// Mirrored in the life_experiences.category check constraint and in
// apps/mcp/src/index.ts.
const EXPERIENCE_CATEGORIES = [
  "travel",
  "adventure",
  "craft",
  "people",
  "create",
  "wellbeing",
  "contribute",
  "other",
] as const;

export const ASSISTANT_TOOLS: Anthropic.Tool[] = [
  {
    name: "list_tasks",
    description:
      "List the user's tasks. Call this before answering questions about workload, priorities, overdue items, or what to do next. Returns id, title, status, urgency/importance (1-4), quadrant, due date, tags, energy, estimate. A task with has_subtasks is a project; stalled means it has no actionable next-step subtask. Pass parent_task_id to list a task's subtasks. Filter by context_tag/energy to answer \"what can I do at home with low energy?\".",
    input_schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["inbox", "next", "waiting", "scheduled", "someday", "done", "all_open"],
          description: "Filter by status. 'all_open' = everything not done/cancelled.",
        },
        parent_task_id: {
          type: "string",
          description: "List the subtasks of this task instead of top-level tasks",
        },
        context_tag: {
          type: "string",
          description: "Only tasks with this context tag (e.g. 'home', 'phone')",
        },
        energy: {
          type: "string",
          enum: ["low", "medium", "high"],
          description: "Only tasks at this energy level",
        },
        due_within_days: {
          type: "number",
          description: "Only tasks due within N days (includes overdue)",
        },
      },
      required: [],
    },
  },
  {
    name: "create_task",
    description:
      "Create a new task for the user. Use status 'inbox' for raw captures, 'next' for actionable next steps the user asked for explicitly.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        status: {
          type: "string",
          enum: ["inbox", "next", "waiting", "scheduled", "someday"],
        },
        notes: { type: "string" },
        outcome: {
          type: "string",
          description: "For multi-step outcomes: what does 'done' look like?",
        },
        energy: {
          type: "string",
          enum: ["low", "medium", "high"],
          description: "Energy the task demands",
        },
        parent_task_id: {
          type: "string",
          description:
            "Make this a subtask of that task — use to build project structures (a task with subtasks is a project)",
        },
        due_at: { type: "string", description: "ISO 8601 datetime" },
        urgency: { type: "number", description: "1-4" },
        importance: { type: "number", description: "1-4" },
        estimated_minutes: { type: "number" },
        context_tags: { type: "array", items: { type: "string" } },
        recurrence_rule: {
          type: "string",
          description: "RRULE subset, e.g. FREQ=WEEKLY;INTERVAL=1;BYDAY=MO",
        },
        waiting_on: { type: "string", description: "Who/what is blocking (status waiting)" },
      },
      required: ["title"],
    },
  },
  {
    name: "update_task",
    description:
      "Update fields on an existing task: reprioritise (urgency/importance), reschedule (due_at), change status, nest it under a parent task, edit title/notes/outcome, or move it in a manually ordered list (sort_order). Get the task id from list_tasks first.",
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "string" },
        title: { type: "string" },
        notes: { type: "string" },
        outcome: { type: "string" },
        status: {
          type: "string",
          enum: ["inbox", "next", "waiting", "scheduled", "someday", "cancelled"],
        },
        urgency: { type: "number" },
        importance: { type: "number" },
        energy: {
          type: "string",
          enum: ["low", "medium", "high"],
          description: "Energy the task demands",
        },
        context_tags: {
          type: "array",
          items: { type: "string" },
          description: "Replaces the task's context tags",
        },
        due_at: { type: "string", description: "ISO 8601, or empty string to clear" },
        defer_until: { type: "string" },
        parent_task_id: {
          type: "string",
          description: "Move under this parent task, or empty string to make top-level",
        },
        estimated_minutes: { type: "number" },
        waiting_on: { type: "string" },
        sort_order: {
          type: "number",
          description:
            "Manual list position — lists sort ascending by this before priority; pick a value between the neighbours' sort_order (fractions allowed)",
        },
      },
      required: ["task_id"],
    },
  },
  {
    name: "complete_task",
    description:
      "Mark a task done. Recurring tasks automatically get their next occurrence scheduled.",
    input_schema: {
      type: "object",
      properties: { task_id: { type: "string" } },
      required: ["task_id"],
    },
  },
  {
    name: "delete_task",
    description:
      "Permanently delete a task; its subtasks are deleted with it. Irreversible — only when the user explicitly asks to delete/remove a task. To drop a task while keeping history, use update_task with status 'cancelled' instead. Get the task id from list_tasks first.",
    input_schema: {
      type: "object",
      properties: { task_id: { type: "string" } },
      required: ["task_id"],
    },
  },
  {
    name: "list_life_experiences",
    description:
      "List the experiences the user wants to have in their life (the lifetime map), with the age window each is placed in and the calendar years that window covers. Also returns the user's life horizon — current age, years left, share of the horizon spent. Call this for questions about what they want to live, what is planned for a stage of life, what windows are closing, or what is still an unplaced dream.",
    input_schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["dream", "planned", "active", "lived", "released", "open"],
          description:
            "'open' = everything not lived or released. 'released' = consciously let go.",
        },
        category: {
          type: "string",
          enum: EXPERIENCE_CATEGORIES,
          description: "Only experiences of this kind",
        },
        unplaced: {
          type: "boolean",
          description: "Only experiences with no age window yet",
        },
        within_years: {
          type: "number",
          description:
            "Only windows open now or opening within N years — use for \"what should I do soon?\"",
        },
      },
      required: [],
    },
  },
  {
    name: "save_life_experience",
    description:
      "Create or update an experience on the lifetime map. Omit experience_id to create. Place it in life with target_age_start/target_age_end (ages, not dates — 'in my 40s' is 40 to 49); pass unplace to take the window off again. Use status 'lived' when it happened (with a reflection) and 'released' when the user consciously lets it go.",
    input_schema: {
      type: "object",
      properties: {
        experience_id: {
          type: "string",
          description: "Update this experience; omit to create a new one",
        },
        title: { type: "string", description: "Required when creating" },
        notes: { type: "string", description: "Why this one matters" },
        category: { type: "string", enum: EXPERIENCE_CATEGORIES },
        status: {
          type: "string",
          enum: ["dream", "planned", "active", "lived", "released"],
          description:
            "Defaults follow the window: giving one makes it 'planned', removing it makes it 'dream'",
        },
        target_age_start: { type: "number", description: "Age the window opens" },
        target_age_end: { type: "number", description: "Age the window closes (inclusive)" },
        unplace: {
          type: "boolean",
          description: "Clear the age window, back to an unplaced dream",
        },
        with_whom: { type: "string", description: "Who it should be with" },
        value_id: { type: "string", description: "Life value this serves" },
        lived_on: { type: "string", description: "YYYY-MM-DD; set automatically with status 'lived'" },
        reflection: {
          type: "string",
          description: "What it was actually like, or why it is being let go",
        },
      },
      required: [],
    },
  },
  {
    name: "delete_life_experience",
    description:
      "Permanently delete an experience from the lifetime map. Irreversible — prefer save_life_experience with status 'released' to let something go while keeping the record of having wanted it.",
    input_schema: {
      type: "object",
      properties: { experience_id: { type: "string" } },
      required: ["experience_id"],
    },
  },
  {
    name: "set_life_horizon",
    description:
      "Set the scale the lifetime map is drawn against: the user's birth date and the age they choose to plan to (not a prediction — the default is 85). Without a birth date the map has no ages or years.",
    input_schema: {
      type: "object",
      properties: {
        birth_date: { type: "string", description: "YYYY-MM-DD" },
        life_expectancy: { type: "number", description: "40-120; the age they plan to" },
      },
      required: [],
    },
  },
];

interface ToolContext {
  supabase: SupabaseClient;
  userId: string;
  spaceId: string;
}

type ToolInput = Record<string, unknown>;

async function listTasks(ctx: ToolContext, input: ToolInput) {
  let query = ctx.supabase
    .from("tasks")
    .select("id, title, status, urgency, importance, due_at, defer_until, estimated_minutes, energy, context_tags, waiting_on, recurrence_rule, outcome, parent_task_id, sort_order, created_at, notes")
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

  const now = new Date();
  const all = data ?? [];
  // has_subtasks/stalled are computed against the full fetch, before the
  // ranked output is narrowed to one level of the tree.
  const openChildCounts = new Map<string, number>();
  for (const t of all) {
    if (t.parent_task_id && !["done", "cancelled"].includes(t.status)) {
      openChildCounts.set(
        t.parent_task_id,
        (openChildCounts.get(t.parent_task_id) ?? 0) + 1
      );
    }
  }

  let tasks = input.parent_task_id
    ? all.filter((t) => t.parent_task_id === input.parent_task_id)
    : all.filter((t) => !t.parent_task_id);
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
    : tasks.sort((a, b) => priorityScore(b, now) - priorityScore(a, now));

  return sorted
    .map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      urgency: t.urgency,
      importance: t.importance,
      quadrant: quadrant(t.urgency, t.importance),
      due_at: t.due_at,
      deferred: isDeferred(t, now),
      estimated_minutes: t.estimated_minutes,
      energy: t.energy,
      tags: t.context_tags,
      waiting_on: t.waiting_on,
      recurring: t.recurrence_rule,
      outcome: t.outcome,
      has_subtasks: (openChildCounts.get(t.id) ?? 0) > 0,
      stalled: isStalledParent(t, all, now),
      sort_order: t.sort_order,
      notes: t.notes?.slice(0, 200) ?? null,
    }));
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
  const { data, error } = await ctx.supabase
    .from("tasks")
    .update(patch)
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

export async function executeAssistantTool(
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
