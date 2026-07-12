import { describe, expect, it } from "vitest";
import { parseQuickAdd } from "../src/nlparse";

// 2026-07-07 is a Tuesday.
const now = new Date("2026-07-07T10:00:00");

describe("parseQuickAdd", () => {
  it("passes plain text through", () => {
    const p = parseQuickAdd("Buy milk", now);
    expect(p.title).toBe("Buy milk");
    expect(p.dueAt).toBeNull();
    expect(p.tags).toEqual([]);
  });

  it("parses the kitchen-sink example", () => {
    const p = parseQuickAdd(
      "Call mom tomorrow at 3pm @phone #Family !urgent ~15m",
      now
    );
    expect(p.title).toBe("Call mom");
    expect(p.dueAt).toEqual(new Date("2026-07-08T15:00:00"));
    expect(p.tags).toEqual(["phone"]);
    expect(p.parentHint).toBe("Family");
    expect(p.urgency).toBe(4);
    expect(p.estimatedMinutes).toBe(15);
  });

  it("parses weekdays and next-weekday", () => {
    expect(parseQuickAdd("Review report friday", now).dueAt).toEqual(
      new Date("2026-07-10T17:00:00")
    );
    // "tuesday" on a Tuesday = next week's Tuesday
    expect(parseQuickAdd("Standup tuesday", now).dueAt).toEqual(
      new Date("2026-07-14T17:00:00")
    );
    expect(parseQuickAdd("Plan trip next monday", now).dueAt).toEqual(
      new Date("2026-07-13T17:00:00")
    );
  });

  it("parses relative offsets", () => {
    expect(parseQuickAdd("Renew passport in 3 weeks", now).dueAt).toEqual(
      new Date("2026-07-28T17:00:00")
    );
    expect(parseQuickAdd("Dentist in 2 days", now).dueAt).toEqual(
      new Date("2026-07-09T17:00:00")
    );
  });

  it("time without a date lands on the next such time", () => {
    expect(parseQuickAdd("Gym at 7am", now).dueAt).toEqual(
      new Date("2026-07-08T07:00:00") // 7am already passed today
    );
    expect(parseQuickAdd("Call bank at 4pm", now).dueAt).toEqual(
      new Date("2026-07-07T16:00:00")
    );
  });

  it("parses recurrence phrases into RRULEs", () => {
    expect(parseQuickAdd("Water plants every 3 days", now).recurrenceRule).toBe(
      "FREQ=DAILY;INTERVAL=3"
    );
    expect(parseQuickAdd("Team sync every monday", now).recurrenceRule).toBe(
      "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO"
    );
    expect(parseQuickAdd("Pay rent every month", now).recurrenceRule).toBe(
      "FREQ=MONTHLY;INTERVAL=1"
    );
    expect(parseQuickAdd("Journal every weekday", now).recurrenceRule).toBe(
      "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR"
    );
  });

  it("parses estimates with hours and minutes", () => {
    expect(parseQuickAdd("Write essay ~2h", now).estimatedMinutes).toBe(120);
    expect(parseQuickAdd("Deep work ~1h30m", now).estimatedMinutes).toBe(90);
    expect(parseQuickAdd("Email ~10m", now).estimatedMinutes).toBe(10);
  });

  it("parses multiple tags and someday", () => {
    const p = parseQuickAdd("Learn piano @home @music !someday", now);
    expect(p.tags).toEqual(["home", "music"]);
    expect(p.someday).toBe(true);
    expect(p.title).toBe("Learn piano");
  });

  it("keeps emails and mid-word symbols intact", () => {
    const p = parseQuickAdd("Email keivan.sina@gmail.com about trip", now);
    expect(p.title).toBe("Email keivan.sina@gmail.com about trip");
    expect(p.tags).toEqual([]);
  });

  it("parses energy levels", () => {
    expect(parseQuickAdd("File taxes ^high", now).energy).toBe("high");
    expect(parseQuickAdd("Sort photos ^low @home", now).energy).toBe("low");
    expect(parseQuickAdd("Review notes ^med", now).energy).toBe("medium");
    expect(parseQuickAdd("Plan sprint ^medium", now).energy).toBe("medium");
    const p = parseQuickAdd("Sort photos ^low", now);
    expect(p.title).toBe("Sort photos");
    expect(parseQuickAdd("Solve 2^high math puzzle", now).energy).toBe(null);
    expect(parseQuickAdd("No energy here", now).energy).toBe(null);
  });
});
