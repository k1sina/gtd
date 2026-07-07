// Tools the AI assistant can call. Every tool executes against the signed-in
// user's Supabase client, so row-level security scopes all reads and writes.

import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isDeferred,
  nextOccurrence,
  planDay,
  priorityScore,
  quadrant,
  type Interval,
} from "@gtd/shared";
import {
  getCalendarAccount,
  getValidAccessToken,
  plannerConfig,
} from "./calendar-account";
import { listEvents } from "./google";

export const ASSISTANT_TOOLS: Anthropic.Tool[] = [
  {
    name: "list_tasks",
    description:
      "List the user's tasks. Call this before answering questions about workload, priorities, overdue items, or what to do next. Returns id, title, status, urgency/importance (1-4), quadrant, due date, project, tags, estimate.",
    input_schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["inbox", "next", "waiting", "scheduled", "someday", "done", "all_open"],
          description: "Filter by status. 'all_open' = everything not done/cancelled.",
        },
        project_id: { type: "string", description: "Only tasks in this project" },
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
        project_id: { type: "string" },
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
      "Update fields on an existing task: reprioritise (urgency/importance), reschedule (due_at), change status, move to a project, edit title/notes. Get the task id from list_tasks first.",
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "string" },
        title: { type: "string" },
        notes: { type: "string" },
        status: {
          type: "string",
          enum: ["inbox", "next", "waiting", "scheduled", "someday", "cancelled"],
        },
        urgency: { type: "number" },
        importance: { type: "number" },
        due_at: { type: "string", description: "ISO 8601, or empty string to clear" },
        defer_until: { type: "string" },
        project_id: { type: "string" },
        estimated_minutes: { type: "number" },
        waiting_on: { type: "string" },
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
    name: "list_projects",
    description:
      "List the user's projects with open/done task counts and whether each active project is missing a next action (stalled). Use for project reviews and weekly-review help.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "create_project",
    description: "Create a new project (any outcome needing more than one action).",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        outcome: { type: "string", description: "What does 'done' look like?" },
      },
      required: ["name"],
    },
  },
  {
    name: "plan_day",
    description:
      "Propose focus time blocks for today: fits the user's top-priority open tasks into free slots of their working day around calendar events. Returns the proposed blocks; the user confirms them in the Today view.",
    input_schema: { type: "object", properties: {}, required: [] },
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
    .select("id, title, status, urgency, importance, due_at, defer_until, estimated_minutes, context_tags, waiting_on, recurrence_rule, project_id, parent_task_id, notes")
    .eq("space_id", ctx.spaceId);

  const status = input.status as string | undefined;
  if (status === "all_open" || !status) {
    query = query.not("status", "in", '("done","cancelled")');
  } else {
    query = query.eq("status", status);
  }
  const { data, error } = await query.limit(200);
  if (error) throw new Error(error.message);

  const now = new Date();
  let tasks = (data ?? []).filter((t) => !t.parent_task_id);
  if (input.due_within_days != null) {
    const cutoff = new Date(now.getTime() + Number(input.due_within_days) * 86400000);
    tasks = tasks.filter((t) => t.due_at && new Date(t.due_at) <= cutoff);
  }
  if (input.project_id) {
    tasks = tasks.filter((t) => t.project_id === input.project_id);
  }

  return tasks
    .sort((a, b) => priorityScore(b, now) - priorityScore(a, now))
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
      tags: t.context_tags,
      waiting_on: t.waiting_on,
      recurring: t.recurrence_rule,
      project_id: t.project_id,
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

  let nextDue: string | null = null;
  if (task.recurrence_rule) {
    const now = new Date();
    const anchor = task.due_at ? new Date(task.due_at) : now;
    const next = nextOccurrence(task.recurrence_rule, anchor, now);
    if (next) {
      nextDue = next.toISOString();
      await ctx.supabase.from("tasks").insert({
        space_id: task.space_id,
        project_id: task.project_id,
        created_by: ctx.userId,
        title: task.title,
        notes: task.notes,
        status: "next",
        urgency: task.urgency,
        importance: task.importance,
        due_at: nextDue,
        estimated_minutes: task.estimated_minutes,
        context_tags: task.context_tags,
        recurrence_rule: task.recurrence_rule,
        recurrence_parent_id: task.recurrence_parent_id ?? task.id,
      });
    }
  }
  return { completed: task.title, next_occurrence: nextDue };
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
      stalled:
        p.status === "active" && !open.some((t) => t.status === "next"),
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

  const account = await getCalendarAccount(ctx.supabase);
  const config = plannerConfig(account);

  const busy: Interval[] = [];
  if (account) {
    try {
      const token = await getValidAccessToken(ctx.supabase, account);
      const events = await listEvents(token, account.calendar_id, dayStart, dayEnd);
      for (const e of events) {
        if (e.transparency === "transparent") continue;
        if (e.start?.dateTime && e.end?.dateTime) {
          busy.push({ start: new Date(e.start.dateTime), end: new Date(e.end.dateTime) });
        }
      }
    } catch {
      // plan without calendar
    }
  }

  const { data: tasks } = await ctx.supabase
    .from("tasks")
    .select("id, title, urgency, importance, due_at, defer_until, estimated_minutes, parent_task_id")
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
    calendar_connected: !!account,
    proposed_blocks: blocks.map((b) => ({
      task: b.title,
      start: b.start.toISOString(),
      end: b.end.toISOString(),
    })),
    note: "Blocks are saved as suggestions — the user confirms them on the Today view.",
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
