import { describe, expect, it } from "vitest";
import {
  describeRule,
  formatRule,
  nextOccurrence,
  parseRule,
} from "../src/recurrence";

describe("parseRule / formatRule", () => {
  it("round-trips a weekly rule with days", () => {
    const rule = parseRule("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE");
    expect(rule).toEqual({ freq: "WEEKLY", interval: 2, byday: [0, 2] });
    expect(formatRule(rule!)).toBe("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE");
  });

  it("defaults interval to 1 and rejects unknown freq", () => {
    expect(parseRule("FREQ=DAILY")).toEqual({ freq: "DAILY", interval: 1 });
    expect(parseRule("FREQ=HOURLY")).toBeNull();
  });
});

describe("nextOccurrence", () => {
  // 2026-07-07 is a Tuesday.
  const anchor = new Date("2026-07-07T09:00:00");

  it("daily", () => {
    expect(nextOccurrence("FREQ=DAILY;INTERVAL=1", anchor)).toEqual(
      new Date("2026-07-08T09:00:00")
    );
  });

  it("every 3 days keeps phase from the anchor", () => {
    expect(nextOccurrence("FREQ=DAILY;INTERVAL=3", anchor)).toEqual(
      new Date("2026-07-10T09:00:00")
    );
  });

  it("weekly without BYDAY repeats the anchor weekday", () => {
    expect(nextOccurrence("FREQ=WEEKLY;INTERVAL=1", anchor)).toEqual(
      new Date("2026-07-14T09:00:00")
    );
  });

  it("weekly BYDAY picks the next listed day", () => {
    // From Tuesday, MO,FR -> Friday the 10th
    expect(nextOccurrence("FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,FR", anchor)).toEqual(
      new Date("2026-07-10T09:00:00")
    );
  });

  it("biweekly BYDAY stays in the anchor's week phase", () => {
    // Week of Jul 6 is the anchor week; next MO on interval 2 is Jul 20.
    expect(nextOccurrence("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO", anchor)).toEqual(
      new Date("2026-07-20T09:00:00")
    );
  });

  it("monthly clamps to the end of shorter months", () => {
    const jan31 = new Date("2026-01-31T10:00:00");
    expect(nextOccurrence("FREQ=MONTHLY;INTERVAL=1", jan31)).toEqual(
      new Date("2026-02-28T10:00:00")
    );
  });

  it("monthly BYMONTHDAY", () => {
    expect(nextOccurrence("FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=15", anchor)).toEqual(
      new Date("2026-07-15T09:00:00")
    );
  });

  it("yearly", () => {
    expect(nextOccurrence("FREQ=YEARLY;INTERVAL=1", anchor)).toEqual(
      new Date("2027-07-07T09:00:00")
    );
  });

  it("yearly clamps a Feb 29 anchor to Feb 28 in non-leap years", () => {
    const leap = new Date("2028-02-29T09:00:00");
    expect(nextOccurrence("FREQ=YEARLY;INTERVAL=1", leap)).toEqual(
      new Date("2029-02-28T09:00:00")
    );
  });

  it("catches up when completed late: next occurrence is after `after`", () => {
    const lateCompletion = new Date("2026-07-20T15:00:00");
    expect(
      nextOccurrence("FREQ=WEEKLY;INTERVAL=1", anchor, lateCompletion)
    ).toEqual(new Date("2026-07-21T09:00:00"));
  });
});

describe("describeRule", () => {
  it("humanises common rules", () => {
    expect(describeRule("FREQ=DAILY;INTERVAL=1")).toBe("every day");
    expect(describeRule("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE")).toBe(
      "every 2 weeks on Mon, Wed"
    );
    expect(describeRule("FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=1")).toBe(
      "every month on day 1"
    );
  });
});
