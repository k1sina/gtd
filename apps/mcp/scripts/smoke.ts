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
  "delete_task",
  "list_life_experiences",
  "save_life_experience",
  "delete_life_experience",
  "set_life_horizon",
  "list_habits",
  "save_habit",
  "log_habit",
  "delete_habit",
  "list_life_values",
  "save_life_value",
  "delete_life_value",
  "list_goals",
  "save_goal",
  "delete_goal",
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

// A task with subtasks is a project — exercise the parent/subtask surface.
const sub = await client.callTool({
  name: "create_task",
  arguments: { title: `${marker} subtask`, status: "next", parent_task_id: taskId },
});
if (sub.isError) fail(`create_task (subtask) errored: ${textOf(sub)}`);
const subId: string =
  JSON.parse(textOf(sub)).created?.id ?? fail("subtask create returned no id");
console.log(`Tier 2: created subtask ${subId}`);

const relisted = await client.callTool({
  name: "list_tasks",
  arguments: { status: "next" },
});
if (relisted.isError) fail(`list_tasks errored: ${textOf(relisted)}`);
const parentRow = (JSON.parse(textOf(relisted)) as Array<Record<string, unknown>>).find(
  (t) => t.id === taskId
);
if (!parentRow?.has_subtasks) fail("parent task not flagged has_subtasks");
if (parentRow.stalled) fail("parent with a next subtask must not be stalled");
console.log("Tier 2: has_subtasks/stalled OK");

const subs = await client.callTool({
  name: "list_tasks",
  arguments: { parent_task_id: taskId },
});
if (subs.isError) fail(`list_tasks (subtasks) errored: ${textOf(subs)}`);
if (!textOf(subs).includes(subId)) fail("subtask missing from parent_task_id listing");
console.log("Tier 2: subtask listing OK");

const subDone = await client.callTool({
  name: "complete_task",
  arguments: { task_id: subId },
});
if (subDone.isError) fail(`complete_task (subtask) errored: ${textOf(subDone)}`);

const completed = await client.callTool({
  name: "complete_task",
  arguments: { task_id: taskId },
});
if (completed.isError) fail(`complete_task errored: ${textOf(completed)}`);
if (JSON.parse(textOf(completed)).completed !== marker) {
  fail("complete_task returned unexpected payload");
}
console.log("Tier 2: complete_task OK (tasks end in done — self-cleaning)");

// delete_task removes the done pair entirely; the subtask goes via cascade.
const deleted = await client.callTool({
  name: "delete_task",
  arguments: { task_id: taskId },
});
if (deleted.isError) fail(`delete_task errored: ${textOf(deleted)}`);
if (JSON.parse(textOf(deleted)).deleted !== marker) {
  fail("delete_task returned unexpected payload");
}
const afterDelete = await client.callTool({
  name: "list_tasks",
  arguments: { status: "done" },
});
if (afterDelete.isError) fail(`list_tasks (post-delete) errored: ${textOf(afterDelete)}`);
if (textOf(afterDelete).includes(taskId) || textOf(afterDelete).includes(subId)) {
  fail("deleted task or its subtask still present after delete_task");
}
console.log("Tier 2: delete_task OK (cascade removed the subtask)");

// ---- Tier 2: lifetime map -------------------------------------------------
// set_life_horizon is deliberately not exercised: it would overwrite the real
// account's birth date. The map is read as it stands.
const mapListed = await client.callTool({
  name: "list_life_experiences",
  arguments: { status: "open" },
});
if (mapListed.isError) fail(`list_life_experiences errored: ${textOf(mapListed)}`);
const mapBody = JSON.parse(textOf(mapListed));
if (!Array.isArray(mapBody.experiences)) {
  fail("list_life_experiences returned no experiences array");
}
console.log(
  `Tier 2: lifetime map readable (horizon ${mapBody.horizon ? "set" : "unset"})`
);

const savedExp = await client.callTool({
  name: "save_life_experience",
  arguments: {
    title: marker,
    category: "adventure",
    target_age_start: 40,
    target_age_end: 45,
  },
});
if (savedExp.isError) fail(`save_life_experience errored: ${textOf(savedExp)}`);
const savedBody = JSON.parse(textOf(savedExp)).saved;
const expId: string = savedBody?.id ?? fail("save_life_experience returned no id");
// A window with no status given makes it planned.
if (savedBody.status !== "planned") {
  fail(`expected a placed experience to be 'planned', got ${savedBody.status}`);
}
console.log(`Tier 2: created experience ${expId} (${savedBody.window ?? "no horizon"})`);

const unplaced = await client.callTool({
  name: "save_life_experience",
  arguments: { experience_id: expId, unplace: true },
});
if (unplaced.isError) fail(`save_life_experience (unplace) errored: ${textOf(unplaced)}`);
const unplacedBody = JSON.parse(textOf(unplaced)).saved;
if (unplacedBody.target_age_start !== null || unplacedBody.status !== "dream") {
  fail("unplace did not clear the window back to a dream");
}
console.log("Tier 2: unplace OK");

const deletedExp = await client.callTool({
  name: "delete_life_experience",
  arguments: { experience_id: expId },
});
if (deletedExp.isError) fail(`delete_life_experience errored: ${textOf(deletedExp)}`);
if (JSON.parse(textOf(deletedExp)).deleted !== marker) {
  fail("delete_life_experience returned unexpected payload");
}
console.log("Tier 2: delete_life_experience OK (self-cleaning)");

// ---- Tier 2: habits -------------------------------------------------------
const savedHabit = await client.callTool({
  name: "save_habit",
  arguments: { name: marker, weekdays: [0, 1, 2, 3, 4, 5, 6] },
});
if (savedHabit.isError) fail(`save_habit errored: ${textOf(savedHabit)}`);
const habitId: string =
  JSON.parse(textOf(savedHabit)).saved?.id ?? fail("save_habit returned no id");
console.log(`Tier 2: created habit ${habitId}`);

const ticked = await client.callTool({
  name: "log_habit",
  arguments: { habit_id: habitId },
});
if (ticked.isError) fail(`log_habit errored: ${textOf(ticked)}`);

const habitsListed = await client.callTool({ name: "list_habits", arguments: {} });
if (habitsListed.isError) fail(`list_habits errored: ${textOf(habitsListed)}`);
const habitRow = (JSON.parse(textOf(habitsListed)) as Array<Record<string, unknown>>)
  .find((h) => h.id === habitId);
if (!habitRow) fail("created habit missing from list_habits");
if (!habitRow.done_today || habitRow.streak !== 1) {
  fail(`expected a ticked habit to read done_today with streak 1, got ${JSON.stringify(habitRow)}`);
}
console.log("Tier 2: log_habit + streak OK");

// Re-ticking the same day must be a no-op, not a duplicate-key error.
const reticked = await client.callTool({
  name: "log_habit",
  arguments: { habit_id: habitId },
});
if (reticked.isError) fail(`log_habit (repeat) errored: ${textOf(reticked)}`);

const unticked = await client.callTool({
  name: "log_habit",
  arguments: { habit_id: habitId, done: false },
});
if (unticked.isError) fail(`log_habit (untick) errored: ${textOf(unticked)}`);
console.log("Tier 2: re-tick is idempotent, untick OK");

const deletedHabit = await client.callTool({
  name: "delete_habit",
  arguments: { habit_id: habitId },
});
if (deletedHabit.isError) fail(`delete_habit errored: ${textOf(deletedHabit)}`);
if (JSON.parse(textOf(deletedHabit)).deleted !== marker) {
  fail("delete_habit returned unexpected payload");
}
console.log("Tier 2: delete_habit OK (self-cleaning)");

// ---- Tier 2: values and goals ---------------------------------------------
const savedValue = await client.callTool({
  name: "save_life_value",
  arguments: { name: marker, description: "created by the smoke test" },
});
if (savedValue.isError) fail(`save_life_value errored: ${textOf(savedValue)}`);
const valueId: string =
  JSON.parse(textOf(savedValue)).saved?.id ?? fail("save_life_value returned no id");

const savedGoal = await client.callTool({
  name: "save_goal",
  arguments: { title: marker, value_id: valueId },
});
if (savedGoal.isError) fail(`save_goal errored: ${textOf(savedGoal)}`);
const goalId: string =
  JSON.parse(textOf(savedGoal)).saved?.id ?? fail("save_goal returned no id");
console.log(`Tier 2: created value ${valueId} and goal ${goalId}`);

const goalsListed = await client.callTool({
  name: "list_goals",
  arguments: { current_quarter: true },
});
if (goalsListed.isError) fail(`list_goals errored: ${textOf(goalsListed)}`);
const goalRow = (JSON.parse(textOf(goalsListed)) as Array<Record<string, unknown>>)
  .find((g) => g.id === goalId);
if (!goalRow) fail("new goal missing from this quarter's list_goals");
if (goalRow.value !== marker || goalRow.current !== true) {
  fail(`expected the goal in the current quarter with its value resolved, got ${JSON.stringify(goalRow)}`);
}
console.log("Tier 2: list_goals resolves the value and the current quarter");

const valuesListed = await client.callTool({ name: "list_life_values", arguments: {} });
if (valuesListed.isError) fail(`list_life_values errored: ${textOf(valuesListed)}`);
const valueRow = (JSON.parse(textOf(valuesListed)) as Array<Record<string, unknown>>)
  .find((v) => v.id === valueId);
if (valueRow?.active_goals !== 1) {
  fail(`expected the value to count 1 active goal, got ${JSON.stringify(valueRow)}`);
}
console.log("Tier 2: list_life_values counts active goals");

const deletedGoal = await client.callTool({
  name: "delete_goal",
  arguments: { goal_id: goalId },
});
if (deletedGoal.isError) fail(`delete_goal errored: ${textOf(deletedGoal)}`);
const deletedValue = await client.callTool({
  name: "delete_life_value",
  arguments: { value_id: valueId },
});
if (deletedValue.isError) fail(`delete_life_value errored: ${textOf(deletedValue)}`);
console.log("Tier 2: delete_goal + delete_life_value OK (self-cleaning)");

console.log("SMOKE PASS");
await client.close();
process.exit(0);
