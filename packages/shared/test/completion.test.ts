import { describe, expect, it } from "vitest";
import { nextOccurrenceInsert, type CompletableTask } from "../src/completion";

const base: CompletableTask = {
  id: "task-1",
  space_id: "space-1",
  project_id: "project-1",
  parent_task_id: null,
  assigned_to: "user-2",
  title: "Water the plants",
  notes: "The ficus too",
  status: "next",
  urgency: 3,
  importance: 2,
  due_at: "2026-07-07T09:00:00.000Z",
  estimated_minutes: 15,
  energy: "low",
  context_tags: ["home"],
  recurrence_rule: "FREQ=WEEKLY;INTERVAL=1",
  recurrence_parent_id: null,
  sort_order: 3.5,
};

const now = new Date("2026-07-07T12:00:00.000Z");

describe("nextOccurrenceInsert", () => {
  it("copies every attribute and advances the due date", () => {
    const insert = nextOccurrenceInsert(base, "user-1", now);
    expect(insert).toMatchObject({
      space_id: "space-1",
      project_id: "project-1",
      created_by: "user-1",
      assigned_to: "user-2",
      title: "Water the plants",
      notes: "The ficus too",
      status: "next",
      urgency: 3,
      importance: 2,
      estimated_minutes: 15,
      energy: "low",
      context_tags: ["home"],
      recurrence_rule: "FREQ=WEEKLY;INTERVAL=1",
      sort_order: 3.5,
    });
    expect(new Date(insert!.due_at) > now).toBe(true);
  });

  it("chains recurrence_parent_id to the original task", () => {
    expect(nextOccurrenceInsert(base, "user-1", now)!.recurrence_parent_id).toBe(
      "task-1"
    );
    expect(
      nextOccurrenceInsert(
        { ...base, recurrence_parent_id: "task-0" },
        "user-1",
        now
      )!.recurrence_parent_id
    ).toBe("task-0");
  });

  it("keeps unclarified tasks in the inbox", () => {
    expect(nextOccurrenceInsert({ ...base, status: "inbox" }, "user-1", now)!.status).toBe("inbox");
    expect(nextOccurrenceInsert({ ...base, status: "scheduled" }, "user-1", now)!.status).toBe("next");
  });

  it("returns null for sub-tasks, non-recurring tasks, and unsupported rules", () => {
    expect(nextOccurrenceInsert({ ...base, parent_task_id: "parent" }, "user-1", now)).toBeNull();
    expect(nextOccurrenceInsert({ ...base, recurrence_rule: null }, "user-1", now)).toBeNull();
    expect(nextOccurrenceInsert({ ...base, recurrence_rule: "FREQ=HOURLY" }, "user-1", now)).toBeNull();
  });

  it("anchors on now when the task has no due date", () => {
    const insert = nextOccurrenceInsert({ ...base, due_at: null }, "user-1", now);
    expect(new Date(insert!.due_at) > now).toBe(true);
  });
});
