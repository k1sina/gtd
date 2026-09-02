import { describe, expect, it } from "vitest";
import type { LifeExperience } from "../src/types";
import {
  ageOn,
  chapterKeyForAge,
  compareExperiences,
  experienceWindow,
  lifeChapters,
  lifeProgress,
  yearAtAge,
} from "../src/life";

const horizon = { birthDate: "1988-07-20", lifeExpectancy: 85 };
const now = new Date(2026, 8, 2); // 2026-09-02, so age 38

describe("ageOn", () => {
  it("counts whole years lived", () => {
    expect(ageOn("1988-07-20", now)).toBe(38);
  });

  it("does not count a birthday that has not happened yet this year", () => {
    expect(ageOn("1988-12-31", new Date(2026, 8, 2))).toBe(37);
    expect(ageOn("1988-09-02", new Date(2026, 8, 2))).toBe(38); // on the day
    expect(ageOn("1988-09-03", new Date(2026, 8, 2))).toBe(37);
  });

  it("clamps to zero before birth and tolerates a malformed date", () => {
    expect(ageOn("2030-01-01", now)).toBe(0);
    expect(ageOn("not-a-date", now)).toBe(0);
  });
});

describe("yearAtAge", () => {
  it("maps an age onto the calendar year it falls in", () => {
    expect(yearAtAge("1988-07-20", 0)).toBe(1988);
    expect(yearAtAge("1988-07-20", 40)).toBe(2028);
  });
});

describe("lifeProgress", () => {
  it("reports age, years left and the share of the horizon lived", () => {
    expect(lifeProgress(horizon, now)).toEqual({
      age: 38,
      yearsLeft: 47,
      percentLived: 45,
      currentYear: 2026,
    });
  });

  it("never reports negative time left past the horizon", () => {
    const old = { birthDate: "1900-01-01", lifeExpectancy: 85 };
    const p = lifeProgress(old, now);
    expect(p.yearsLeft).toBe(0);
    expect(p.percentLived).toBe(100);
  });
});

describe("lifeChapters", () => {
  const chapters = lifeChapters(horizon, now);

  it("covers every decade up to the horizon plus an open-ended tail", () => {
    expect(chapters.map((c) => c.key)).toEqual([
      "0", "10", "20", "30", "40", "50", "60", "70", "80", "beyond",
    ]);
    const beyond = chapters[chapters.length - 1];
    expect(beyond.label).toBe("Beyond 90");
    expect(beyond.endAge).toBeNull();
    expect(beyond.endYear).toBeNull();
  });

  it("marks exactly one chapter as current and everything before it as past", () => {
    expect(chapters.filter((c) => c.isCurrent).map((c) => c.key)).toEqual(["30"]);
    expect(chapters.filter((c) => c.isPast).map((c) => c.key)).toEqual([
      "0", "10", "20",
    ]);
  });

  it("dates each chapter in calendar years and tracks progress through the current one", () => {
    const thirties = chapters.find((c) => c.key === "30")!;
    expect(thirties.label).toBe("Your 30s");
    expect(thirties.startYear).toBe(2018);
    expect(thirties.endYear).toBe(2027);
    expect(thirties.progress).toBeCloseTo(0.8);
    expect(chapters.find((c) => c.key === "40")!.progress).toBeNull();
  });

  it("names the early chapters in plain words", () => {
    expect(chapters[0].label).toBe("Childhood");
    expect(chapters[1].label).toBe("Your teens");
  });
});

describe("chapterKeyForAge", () => {
  it("buckets an age into its decade, and past the horizon into the tail", () => {
    expect(chapterKeyForAge(38, horizon)).toBe("30");
    expect(chapterKeyForAge(40, horizon)).toBe("40");
    expect(chapterKeyForAge(89, horizon)).toBe("80");
    expect(chapterKeyForAge(95, horizon)).toBe("beyond");
  });
});

function exp(patch: Partial<LifeExperience>): LifeExperience {
  return {
    id: "e1",
    user_id: "u1",
    value_id: null,
    title: "Sail the Aegean",
    notes: null,
    category: "travel",
    status: "planned",
    target_age_start: null,
    target_age_end: null,
    with_whom: null,
    lived_on: null,
    reflection: null,
    sort_order: 0,
    created_at: "2026-01-01T00:00:00Z",
    ...patch,
  };
}

describe("experienceWindow", () => {
  it("returns null while the experience is unplaced", () => {
    expect(experienceWindow(exp({}), horizon, now)).toBeNull();
  });

  it("labels a single-age window in ages and years", () => {
    const w = experienceWindow(
      exp({ target_age_start: 45, target_age_end: 45 }),
      horizon,
      now
    )!;
    expect(w.label).toBe("age 45 · 2033");
    expect(w.closingSoon).toBe(false);
    expect(w.missed).toBe(false);
  });

  it("labels a range and fills in a half-open one", () => {
    expect(
      experienceWindow(
        exp({ target_age_start: 40, target_age_end: 45 }),
        horizon,
        now
      )!.label
    ).toBe("age 40–45 · 2028–2033");
    expect(
      experienceWindow(exp({ target_age_end: 50 }), horizon, now)!.label
    ).toBe("age 50 · 2038");
  });

  it("flags a window closing within two years", () => {
    expect(
      experienceWindow(exp({ target_age_end: 40 }), horizon, now)!.closingSoon
    ).toBe(true);
    expect(
      experienceWindow(exp({ target_age_end: 41 }), horizon, now)!.closingSoon
    ).toBe(false);
  });

  it("flags a window that closed on an experience that never happened", () => {
    const missed = experienceWindow(
      exp({ target_age_start: 30, target_age_end: 35 }),
      horizon,
      now
    )!;
    expect(missed.missed).toBe(true);
  });

  it("keeps lived and released experiences out of the urgency flags", () => {
    for (const status of ["lived", "released"] as const) {
      const w = experienceWindow(
        exp({ target_age_start: 30, target_age_end: 35, status }),
        horizon,
        now
      )!;
      expect(w.missed).toBe(false);
      expect(w.closingSoon).toBe(false);
    }
  });
});

describe("compareExperiences", () => {
  it("orders by window start, then manual order, then age of the row", () => {
    const early = exp({ id: "a", target_age_start: 40 });
    const late = exp({ id: "b", target_age_start: 45 });
    const unplaced = exp({ id: "c" });
    expect([late, unplaced, early].sort(compareExperiences).map((e) => e.id))
      .toEqual(["a", "b", "c"]);

    const first = exp({ id: "a", target_age_start: 40, sort_order: 1 });
    const second = exp({ id: "b", target_age_start: 40, sort_order: 2 });
    expect([second, first].sort(compareExperiences).map((e) => e.id)).toEqual([
      "a",
      "b",
    ]);
  });
});
