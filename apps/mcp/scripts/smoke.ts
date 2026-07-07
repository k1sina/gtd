// End-to-end smoke test: spawns the real server over stdio with the MCP SDK
// client. Tier 1 (always): initialize + tools/list. Tier 2 (when credentials
// are configured): a live, self-cleaning CRUD round-trip against Supabase.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import dotenv from "dotenv";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));
const tsxCli = createRequire(import.meta.url).resolve("tsx/cli");
dotenv.config({ path: join(packageDir, ".env") });

const EXPECTED_TOOLS = [
  "list_tasks",
  "create_task",
  "update_task",
  "complete_task",
  "list_projects",
  "create_project",
  "plan_day",
];

function fail(message: string): never {
  console.error(`SMOKE FAIL: ${message}`);
  process.exit(1);
}

function textOf(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const content = result.content as Array<{ type: string; text?: string }>;
  return content
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("\n");
}

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [tsxCli, "src/index.ts"],
  cwd: packageDir,
  env: Object.fromEntries(
    Object.entries(process.env).filter(([, v]) => v !== undefined)
  ) as Record<string, string>,
});

const client = new Client({ name: "clarity-smoke", version: "0.1.0" });
await client.connect(transport);

// ---- Tier 1: transport + tool registry (no credentials required) ----------
const { tools } = await client.listTools();
const names = tools.map((t) => t.name).sort();
if (JSON.stringify(names) !== JSON.stringify([...EXPECTED_TOOLS].sort())) {
  fail(`expected tools ${EXPECTED_TOOLS.join(", ")} — got ${names.join(", ")}`);
}
console.log(`Tier 1 OK: server exposes ${tools.length} tools`);

// ---- Tier 2: live round-trip (requires .env credentials) ------------------
if (!process.env.CLARITY_EMAIL || !process.env.CLARITY_PASSWORD) {
  console.log("Tier 2 skipped: CLARITY_EMAIL / CLARITY_PASSWORD not set");
  await client.close();
  process.exit(0);
}

const marker = `MCP smoke ${new Date().toISOString()}`;

const created = await client.callTool({
  name: "create_task",
  arguments: { title: marker, status: "next", urgency: 3, importance: 3 },
});
if (created.isError) fail(`create_task errored: ${textOf(created)}`);
const createdBody = JSON.parse(textOf(created));
const taskId: string = createdBody.created?.id ?? fail("create_task returned no id");
console.log(`Tier 2: created task ${taskId}`);

const listed = await client.callTool({
  name: "list_tasks",
  arguments: { status: "next" },
});
if (listed.isError) fail(`list_tasks errored: ${textOf(listed)}`);
if (!textOf(listed).includes(taskId)) fail("created task missing from list_tasks");
console.log("Tier 2: list_tasks sees it");

const updated = await client.callTool({
  name: "update_task",
  arguments: { task_id: taskId, urgency: 4, notes: "updated by smoke test" },
});
if (updated.isError) fail(`update_task errored: ${textOf(updated)}`);
if (JSON.parse(textOf(updated)).updated?.urgency !== 4) {
  fail("update_task did not apply urgency");
}
console.log("Tier 2: update_task applied");

const projects = await client.callTool({ name: "list_projects", arguments: {} });
if (projects.isError) fail(`list_projects errored: ${textOf(projects)}`);
console.log("Tier 2: list_projects OK");

const completed = await client.callTool({
  name: "complete_task",
  arguments: { task_id: taskId },
});
if (completed.isError) fail(`complete_task errored: ${textOf(completed)}`);
if (JSON.parse(textOf(completed)).completed !== marker) {
  fail("complete_task returned unexpected payload");
}
console.log("Tier 2: complete_task OK (task ends in done — self-cleaning)");

console.log("SMOKE PASS");
await client.close();
process.exit(0);
