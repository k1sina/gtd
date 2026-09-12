// Tools the AI assistant can call. Every tool executes against the signed-in
// user's Supabase client, so row-level security scopes all reads and writes.

import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
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
  {
    name: "list_habits",
    description:
      "List the habits in the current space with their schedule, whether they are due and done today, the current streak, and the most recent days. Call this for questions about habits, streaks, consistency, or what is still unticked today.",
    input_schema: {
      type: "object",
      properties: {
        days: {
          type: "number",
          description: "How many recent days to report per habit (1-90, default 7)",
        },
        include_archived: {
          type: "boolean",
          description: "Also list retired habits (archived, not deleted)",
        },
      },
      required: [],
    },
  },
  {
    name: "save_habit",
    description:
      "Create or update a habit. Omit habit_id to create. weekdays uses 0 = Monday … 6 = Sunday, and an empty list means every day. Set archived to retire a habit (reversible, and its history survives) or to bring one back.",
    input_schema: {
      type: "object",
      properties: {
        habit_id: {
          type: "string",
          description: "Update this habit; omit to create a new one",
        },
        name: { type: "string", description: "Required when creating" },
        weekdays: {
          type: "array",
          items: { type: "number" },
          description: "0 = Monday … 6 = Sunday; empty list = every day",
        },
        archived: {
          type: "boolean",
          description: "true retires the habit, false brings it back",
        },
      },
      required: [],
    },
  },
  {
    name: "log_habit",
    description:
      "Tick a habit for a day, or untick it with done false. Defaults to today. Get the habit id from list_habits first.",
    input_schema: {
      type: "object",
      properties: {
        habit_id: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD; defaults to today" },
        done: {
          type: "boolean",
          description: "false removes the tick for that day (default true)",
        },
      },
      required: ["habit_id"],
    },
  },
  {
    name: "delete_habit",
    description:
      "Permanently delete a habit and its whole log history. Irreversible — prefer save_habit with archived true to retire a habit while keeping its record.",
    input_schema: {
      type: "object",
      properties: { habit_id: { type: "string" } },
      required: ["habit_id"],
    },
  },
  {
    name: "list_life_values",
    description:
      "List the user's life values — what matters to them long-term — with how many active goals hang off each. Call this before advising on priorities or goals, and to get the value_id a goal should link to.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "save_life_value",
    description:
      "Create or update a life value (e.g. Health, Family, Craft). Omit value_id to create.",
    input_schema: {
      type: "object",
      properties: {
        value_id: {
          type: "string",
          description: "Update this value; omit to create a new one",
        },
        name: { type: "string", description: "Required when creating" },
        description: {
          type: "string",
          description: "What living this value looks like",
        },
      },
      required: [],
    },
  },
  {
    name: "delete_life_value",
    description:
      "Permanently delete a life value. Goals linked to it survive and lose the link. Irreversible.",
    input_schema: {
      type: "object",
      properties: { value_id: { type: "string" } },
      required: ["value_id"],
    },
  },
  {
    name: "list_goals",
    description:
      "List the user's quarterly goals, newest quarter first, each with the life value it serves and its review score. Call this for questions about what the quarter is for, progress against goals, or whether the work in front of them serves anything.",
    input_schema: {
      type: "object",
      properties: {
        current_quarter: {
          type: "boolean",
          description: "Only this quarter's goals (overrides year/quarter)",
        },
        year: { type: "number" },
        quarter: { type: "number", description: "1-4" },
        status: {
          type: "string",
          enum: ["active", "achieved", "partial", "dropped"],
        },
        value_id: { type: "string", description: "Only goals serving this life value" },
      },
      required: [],
    },
  },
  {
    name: "save_goal",
    description:
      "Create or update a quarterly goal — a concrete outcome for one quarter, optionally linked to a life value. Omit goal_id to create (it defaults to the current quarter). Scores and reflections are what the quarterly review writes back.",
    input_schema: {
      type: "object",
      properties: {
        goal_id: {
          type: "string",
          description: "Update this goal; omit to create a new one",
        },
        title: { type: "string", description: "Required when creating" },
        description: {
          type: "string",
          description: "Why this, why now? How will you know it is done?",
        },
        year: { type: "number" },
        quarter: { type: "number", description: "1-4" },
        value_id: { type: "string", description: "Life value this serves" },
        status: {
          type: "string",
          enum: ["active", "achieved", "partial", "dropped"],
        },
        score: { type: "number", description: "0-10, set during the quarterly review" },
        reflection: { type: "string", description: "How the quarter actually went" },
      },
      required: [],
    },
  },
  {
    name: "delete_goal",
    description:
      "Permanently delete a quarterly goal. Irreversible — prefer save_goal with status 'dropped' to let a goal go while keeping the record of having set it.",
    input_schema: {
      type: "object",
      properties: { goal_id: { type: "string" } },
      required: ["goal_id"],
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
