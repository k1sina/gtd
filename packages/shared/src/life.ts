// Lifetime map: turning a birth date and a chosen life expectancy into the
// chapters an experience can be placed into, and reading an experience's age
// window back out as ages and calendar years.
//
// All of it is local-civil-date arithmetic (no timezone maths): a birth date
// is the day on the calendar, not an instant.
//
// No ClarityCore mirror yet — the lifetime map is web-only so far. Add
// Life.swift alongside its tests when the Apple apps grow the feature.

import type { LifeExperience } from "./types";

/** Chapters are decades of age; the current decade is where "you are here". */
export const CHAPTER_SPAN = 10;

export interface LifeHorizonInput {
  /** "YYYY-MM-DD" */
  birthDate: string;
  /** The horizon planned against, e.g. 85. */
  lifeExpectancy: number;
}

export interface LifeChapter {
  /** Stable key, e.g. "30" for the thirties, "beyond" for the tail. */
  key: string;
  /** e.g. "Your 30s" or "Beyond 85". */
  label: string;
  startAge: number;
  /** Inclusive; null only for the open-ended chapter past life expectancy. */
  endAge: number | null;
  startYear: number;
  endYear: number | null;
  isPast: boolean;
  isCurrent: boolean;
  /** 0..1 through the chapter; only set for the current one. */
  progress: number | null;
}

export interface LifeProgress {
  age: number;
  yearsLeft: number;
  /** 0..100, how much of the planned horizon is behind you. */
  percentLived: number;
  currentYear: number;
}

function parseDateKey(key: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  return { y: +m[1], m: +m[2], d: +m[3] };
}

/** Whole years lived on `on`. Negative before birth is clamped to 0. */
export function ageOn(birthDate: string, on: Date): number {
  const b = parseDateKey(birthDate);
  if (!b) return 0;
  let age = on.getFullYear() - b.y;
  const beforeBirthday =
    on.getMonth() + 1 < b.m ||
    (on.getMonth() + 1 === b.m && on.getDate() < b.d);
  if (beforeBirthday) age -= 1;
  return Math.max(0, age);
}

/** The calendar year in which the user turns `age`. */
export function yearAtAge(birthDate: string, age: number): number {
  const b = parseDateKey(birthDate);
  return (b?.y ?? new Date().getFullYear()) + age;
}

export function lifeProgress(
  horizon: LifeHorizonInput,
  now: Date = new Date()
): LifeProgress {
  const age = ageOn(horizon.birthDate, now);
  const yearsLeft = Math.max(0, horizon.lifeExpectancy - age);
  return {
    age,
    yearsLeft,
    percentLived: Math.min(
      100,
      Math.round((age / Math.max(1, horizon.lifeExpectancy)) * 100)
    ),
    currentYear: now.getFullYear(),
  };
}

function chapterLabel(startAge: number): string {
  if (startAge === 0) return "Childhood";
  if (startAge === 10) return "Your teens";
  return `Your ${startAge}s`;
}

/**
 * Every decade of life from birth to the chosen horizon, plus one open-ended
 * chapter beyond it — planning past your own expectancy is allowed, and the
 * chapter being there says so.
 */
export function lifeChapters(
  horizon: LifeHorizonInput,
  now: Date = new Date()
): LifeChapter[] {
  const age = ageOn(horizon.birthDate, now);
  const last = Math.floor(horizon.lifeExpectancy / CHAPTER_SPAN) * CHAPTER_SPAN;
  const chapters: LifeChapter[] = [];

  for (let startAge = 0; startAge <= last; startAge += CHAPTER_SPAN) {
    const endAge = startAge + CHAPTER_SPAN - 1;
    const isCurrent = age >= startAge && age <= endAge;
    chapters.push({
      key: String(startAge),
      label: chapterLabel(startAge),
      startAge,
      endAge,
      startYear: yearAtAge(horizon.birthDate, startAge),
      endYear: yearAtAge(horizon.birthDate, endAge),
      isPast: endAge < age,
      isCurrent,
      progress: isCurrent ? (age - startAge) / CHAPTER_SPAN : null,
    });
  }

  const beyondStart = last + CHAPTER_SPAN;
  chapters.push({
    key: "beyond",
    label: `Beyond ${beyondStart}`,
    startAge: beyondStart,
    endAge: null,
    startYear: yearAtAge(horizon.birthDate, beyondStart),
    endYear: null,
    isPast: false,
    isCurrent: age >= beyondStart,
    progress: null,
  });

  return chapters;
}

/** The chapter an age window belongs to — keyed off where the window opens. */
export function chapterKeyForAge(
  age: number,
  horizon: LifeHorizonInput
): string {
  const last = Math.floor(horizon.lifeExpectancy / CHAPTER_SPAN) * CHAPTER_SPAN;
  const start = Math.floor(age / CHAPTER_SPAN) * CHAPTER_SPAN;
  return start > last ? "beyond" : String(start);
}

export interface ExperienceWindow {
  startAge: number;
  endAge: number;
  startYear: number;
  endYear: number;
  /** "age 40–45 · 2028–2033" */
  label: string;
  /** Ends within the next two years, and not lived yet. */
  closingSoon: boolean;
  /** The window is behind you and the experience never happened. */
  missed: boolean;
}

/**
 * Reads an experience's window in both scales people actually think in: how
 * old they'll be, and which years those are. Returns null while the
 * experience is an unplaced dream.
 */
export function experienceWindow(
  exp: Pick<
    LifeExperience,
    "target_age_start" | "target_age_end" | "status"
  >,
  horizon: LifeHorizonInput,
  now: Date = new Date()
): ExperienceWindow | null {
  if (exp.target_age_start == null && exp.target_age_end == null) return null;
  const startAge = exp.target_age_start ?? exp.target_age_end!;
  const endAge = exp.target_age_end ?? startAge;
  const startYear = yearAtAge(horizon.birthDate, startAge);
  const endYear = yearAtAge(horizon.birthDate, endAge);
  const age = ageOn(horizon.birthDate, now);
  const open = exp.status !== "lived" && exp.status !== "released";

  const label =
    startAge === endAge
      ? `age ${startAge} · ${startYear}`
      : `age ${startAge}–${endAge} · ${startYear}–${endYear}`;

  return {
    startAge,
    endAge,
    startYear,
    endYear,
    label,
    closingSoon: open && endAge >= age && endAge - age <= 2,
    missed: open && endAge < age,
  };
}

/** Sort for a chapter's cards: earliest window first, then by manual order. */
export function compareExperiences(
  a: LifeExperience,
  b: LifeExperience
): number {
  const aStart = a.target_age_start ?? a.target_age_end ?? Infinity;
  const bStart = b.target_age_start ?? b.target_age_end ?? Infinity;
  if (aStart !== bStart) return aStart - bStart;
  if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
  return a.created_at.localeCompare(b.created_at);
}
