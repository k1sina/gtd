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
      "List the user's tasks. Call this before answering questions about workload, priorities, overdue items, or what to do next. Returns id, title, status, urgency/importance (1-4), quadrant, due date, project, tags, estimate.",
    inputSchema: {
      status: z
        .enum(["inbox", "next", "waiting", "scheduled", "someday", "done", "all_open"])
        .optional()
        .describe("Filter by status. 'all_open' = everything not done/cancelled."),
      project_id: z.string().optional().describe("Only tasks in this project"),
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
      project_id: z.string().optional(),
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
      "Update fields on an existing task: reprioritise (urgency/importance), reschedule (due_at), change status, move to a project, edit title/notes. Get the task id from list_tasks first.",
    inputSchema: {
      task_id: z.string(),
      title: z.string().optional(),
      notes: z.string().optional(),
      status: z
        .enum(["inbox", "next", "waiting", "scheduled", "someday", "cancelled"])
        .optional(),
      urgency: z.number().optional(),
      importance: z.number().optional(),
      due_at: z.string().optional().describe("ISO 8601, or empty string to clear"),
      defer_until: z.string().optional(),
      project_id: z.string().optional(),
      estimated_minutes: z.number().optional(),
      waiting_on: z.string().optional(),
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
  "list_projects",
  {
    description:
      "List the user's projects with open/done task counts and whether each active project is missing a next action (stalled). Use for project reviews and weekly-review help.",
    inputSchema: {},
  },
  handler("list_projects")
);

server.registerTool(
  "create_project",
  {
    description: "Create a new project (any outcome needing more than one action).",
    inputSchema: {
      name: z.string(),
      outcome: z.string().optional().describe("What does 'done' look like?"),
    },
  },
  handler("create_project")
);

server.registerTool(
  "plan_day",
  {
    description:
      "Propose focus time blocks for today: fits the user's top-priority open tasks into free slots of their working day. Busy time comes from already-confirmed time blocks (no direct calendar access from this server). Returns the proposed blocks; the user confirms them in the web app's Today view.",
    inputSchema: {},
  },
  handler("plan_day")
);

const transport = new StdioServerTransport();
await server.connect(transport);
