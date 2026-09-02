#!/usr/bin/env node
// Clarity MCP server (stdio). Mirrors the web assistant's tool surface —
// see apps/web/src/lib/assistant-tools.ts.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { getContext } from "./auth.js";
import { executeTool, type ToolInput } from "./tools.js";

// The server may be spawned from any cwd — load the package's own .env.
dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)) });

const server = new McpServer({ name: "clarity-gtd", version: "0.1.0" });

function handler(name: string) {
  return async (input: ToolInput) => {
    try {
      const ctx = await getContext();
      const result = await executeTool(name, input, ctx);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: error instanceof Error ? error.message : String(error),
          },
        ],
        isError: true,
      };
    }
  };
}

server.registerTool(
  "list_tasks",
  {
    description:
      "List the user's tasks. Call this before answering questions about workload, priorities, overdue items, or what to do next. Returns id, title, status, urgency/importance (1-4), quadrant, due date, tags, energy, estimate. A task with has_subtasks is a project; stalled means it has no actionable next-step subtask. Pass parent_task_id to list a task's subtasks. Filter by context_tag/energy to answer \"what can I do at home with low energy?\".",
    inputSchema: {
      status: z
        .enum(["inbox", "next", "waiting", "scheduled", "someday", "done", "all_open"])
        .optional()
        .describe("Filter by status. 'all_open' = everything not done/cancelled."),
      parent_task_id: z
        .string()
        .optional()
        .describe("List the subtasks of this task instead of top-level tasks"),
      context_tag: z
        .string()
        .optional()
        .describe("Only tasks with this context tag (e.g. 'home', 'phone')"),
      energy: z
        .enum(["low", "medium", "high"])
        .optional()
        .describe("Only tasks at this energy level"),
      due_within_days: z
        .number()
        .optional()
        .describe("Only tasks due within N days (includes overdue)"),
    },
  },
  handler("list_tasks")
);

server.registerTool(
  "create_task",
  {
    description:
      "Create a new task for the user. Use status 'inbox' for raw captures, 'next' for actionable next steps the user asked for explicitly.",
    inputSchema: {
      title: z.string(),
      status: z.enum(["inbox", "next", "waiting", "scheduled", "someday"]).optional(),
      notes: z.string().optional(),
      outcome: z
        .string()
        .optional()
        .describe("For multi-step outcomes: what does 'done' look like?"),
      energy: z
        .enum(["low", "medium", "high"])
        .optional()
        .describe("Energy the task demands"),
      parent_task_id: z
        .string()
        .optional()
        .describe(
          "Make this a subtask of that task — use to build project structures (a task with subtasks is a project)"
        ),
      due_at: z.string().optional().describe("ISO 8601 datetime"),
      urgency: z.number().optional().describe("1-4"),
      importance: z.number().optional().describe("1-4"),
      estimated_minutes: z.number().optional(),
      context_tags: z.array(z.string()).optional(),
      recurrence_rule: z
        .string()
        .optional()
        .describe("RRULE subset, e.g. FREQ=WEEKLY;INTERVAL=1;BYDAY=MO"),
      waiting_on: z.string().optional().describe("Who/what is blocking (status waiting)"),
    },
  },
  handler("create_task")
);

server.registerTool(
  "update_task",
  {
    description:
      "Update fields on an existing task: reprioritise (urgency/importance), reschedule (due_at), change status, nest it under a parent task, edit title/notes/outcome, or move it in a manually ordered list (sort_order). Get the task id from list_tasks first.",
    inputSchema: {
      task_id: z.string(),
      title: z.string().optional(),
      notes: z.string().optional(),
      outcome: z.string().optional(),
      status: z
        .enum(["inbox", "next", "waiting", "scheduled", "someday", "cancelled"])
        .optional(),
      urgency: z.number().optional(),
      importance: z.number().optional(),
      energy: z
        .enum(["low", "medium", "high"])
        .optional()
        .describe("Energy the task demands"),
      context_tags: z
        .array(z.string())
        .optional()
        .describe("Replaces the task's context tags"),
      due_at: z.string().optional().describe("ISO 8601, or empty string to clear"),
      defer_until: z.string().optional(),
      parent_task_id: z
        .string()
        .optional()
        .describe("Move under this parent task, or empty string to make top-level"),
      estimated_minutes: z.number().optional(),
      waiting_on: z.string().optional(),
      sort_order: z
        .number()
        .optional()
        .describe(
          "Manual list position — lists sort ascending by this before priority; pick a value between the neighbours' sort_order (fractions allowed)"
        ),
    },
  },
  handler("update_task")
);

server.registerTool(
  "complete_task",
  {
    description:
      "Mark a task done. Recurring tasks automatically get their next occurrence scheduled.",
    inputSchema: { task_id: z.string() },
  },
  handler("complete_task")
);

server.registerTool(
  "delete_task",
  {
    description:
      "Permanently delete a task; its subtasks are deleted with it. Irreversible — only when the user explicitly asks to delete/remove a task. To drop a task while keeping history, use update_task with status 'cancelled' instead. Get the task id from list_tasks first.",
    inputSchema: { task_id: z.string() },
  },
  handler("delete_task")
);

// --- Lifetime map -----------------------------------------------------------

// Mirrored in the life_experiences.category check constraint and in
// apps/web/src/lib/assistant-tools.ts.
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

server.registerTool(
  "list_life_experiences",
  {
    description:
      "List the experiences the user wants to have in their life (the lifetime map), with the age window each is placed in and the calendar years that window covers. Also returns the user's life horizon — current age, years left, share of the horizon spent. Call this for questions about what they want to live, what is planned for a stage of life, what windows are closing, or what is still an unplaced dream.",
    inputSchema: {
      status: z
        .enum(["dream", "planned", "active", "lived", "released", "open"])
        .optional()
        .describe(
          "'open' = everything not lived or released. 'released' = consciously let go."
        ),
      category: z
        .enum(EXPERIENCE_CATEGORIES)
        .optional()
        .describe("Only experiences of this kind"),
      unplaced: z
        .boolean()
        .optional()
        .describe("Only experiences with no age window yet"),
      within_years: z
        .number()
        .optional()
        .describe(
          'Only windows open now or opening within N years — use for "what should I do soon?"'
        ),
    },
  },
  handler("list_life_experiences")
);

server.registerTool(
  "save_life_experience",
  {
    description:
      "Create or update an experience on the lifetime map. Omit experience_id to create. Place it in life with target_age_start/target_age_end (ages, not dates — 'in my 40s' is 40 to 49); pass unplace to take the window off again. Use status 'lived' when it happened (with a reflection) and 'released' when the user consciously lets it go.",
    inputSchema: {
      experience_id: z
        .string()
        .optional()
        .describe("Update this experience; omit to create a new one"),
      title: z.string().optional().describe("Required when creating"),
      notes: z.string().optional().describe("Why this one matters"),
      category: z.enum(EXPERIENCE_CATEGORIES).optional(),
      status: z
        .enum(["dream", "planned", "active", "lived", "released"])
        .optional()
        .describe(
          "Defaults follow the window: giving one makes it 'planned', removing it makes it 'dream'"
        ),
      target_age_start: z.number().optional().describe("Age the window opens"),
      target_age_end: z
        .number()
        .optional()
        .describe("Age the window closes (inclusive)"),
      unplace: z
        .boolean()
        .optional()
        .describe("Clear the age window, back to an unplaced dream"),
      with_whom: z.string().optional().describe("Who it should be with"),
      value_id: z.string().optional().describe("Life value this serves"),
      lived_on: z
        .string()
        .optional()
        .describe("YYYY-MM-DD; set automatically with status 'lived'"),
      reflection: z
        .string()
        .optional()
        .describe("What it was actually like, or why it is being let go"),
    },
  },
  handler("save_life_experience")
);

server.registerTool(
  "delete_life_experience",
  {
    description:
      "Permanently delete an experience from the lifetime map. Irreversible — prefer save_life_experience with status 'released' to let something go while keeping the record of having wanted it.",
    inputSchema: { experience_id: z.string() },
  },
  handler("delete_life_experience")
);

server.registerTool(
  "set_life_horizon",
  {
    description:
      "Set the scale the lifetime map is drawn against: the user's birth date and the age they choose to plan to (not a prediction — the default is 85). Without a birth date the map has no ages or years.",
    inputSchema: {
      birth_date: z.string().optional().describe("YYYY-MM-DD"),
      life_expectancy: z
        .number()
        .optional()
        .describe("40-120; the age they plan to"),
    },
  },
  handler("set_life_horizon")
);

const transport = new StdioServerTransport();
await server.connect(transport);
