// Tools the AI assistant can call. Every tool executes against the signed-in
// user's Supabase client, so row-level security scopes all reads and writes.

import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isDeferred,
  isStalledParent,
  nextOccurrenceInsert,
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
import { GoogleReauthRequiredError, listEvents } from "./google";

export const ASSISTANT_TOOLS: Anthropic.Tool[] = [
  {
    name: "list_tasks",
    description:
      "List the user's tasks. Call this before answering questions about workload, priorities, overdue items, or what to do next. Returns id, title, status, urgency/importance (1-4), quadrant, due date, tags, estimate. A task with has_subtasks is a project; stalled means it has no actionable next-step subtask. Pass parent_task_id to list a task's subtasks.",
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
    .select("id, title, status, urgency, importance, due_at, defer_until, estimated_minutes, context_tags, waiting_on, recurrence_rule, outcome, parent_task_id, sort_order, created_at, notes")
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

async function planToday(ctx: ToolContext) {
  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const account = await getCalendarAccount(ctx.supabase);
  const config = plannerConfig(account);

  const busy: Interval[] = [];
  let calendarNote: string | null = null;
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
    } catch (err) {
      calendarNote =
        err instanceof GoogleReauthRequiredError
          ? "Google Calendar connection expired — tell the user to reconnect it in Settings. Planned without calendar events."
          : "Calendar fetch failed — planned without calendar events.";
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
    ...(calendarNote ? { calendar_note: calendarNote } : {}),
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
    case "plan_day":
      return planToday(ctx);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
