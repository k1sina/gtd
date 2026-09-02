"use client";

import type {
  ExperienceCategory,
  ExperienceStatus,
  LifeChapter,
  LifeExperience,
  LifeHorizon,
  LifeHorizonInput,
} from "@gtd/shared";
import {
  ageOn,
  chapterKeyForAge,
  compareExperiences,
  experienceWindow,
  lifeChapters,
  lifeProgress,
  yearAtAge,
} from "@gtd/shared";
import clsx from "clsx";
import {
  Check,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  Hammer,
  Heart,
  HeartHandshake,
  Leaf,
  Map as MapIcon,
  Mountain,
  Palette,
  Plane,
  Plus,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  useDeleteLifeExperience,
  useLifeExperiences,
  useLifeHorizon,
  useLifeValues,
  useSaveLifeExperience,
  useSaveLifeHorizon,
} from "@/lib/data";
import { toDateKey } from "@/lib/format";
import {
  Button,
  Dialog,
  EmptyState,
  Input,
  Select,
  Textarea,
} from "./ui";

// Category colours are literal hex, not palette utilities: eight distinct
// hues have to stay legible in both themes, and these mid-tones do (they are
// used as a dot, as text, and as a ~14% tint behind that text).
const CATEGORIES: {
  key: ExperienceCategory;
  label: string;
  color: string;
  icon: typeof Plane;
}[] = [
  { key: "travel", label: "Places", color: "#3b82f6", icon: Plane },
  { key: "adventure", label: "Adventure", color: "#f97316", icon: Mountain },
  { key: "craft", label: "Mastery", color: "#8b5cf6", icon: Hammer },
  { key: "people", label: "People", color: "#ec4899", icon: Users },
  { key: "create", label: "Create", color: "#06b6d4", icon: Palette },
  { key: "wellbeing", label: "Body & mind", color: "#10b981", icon: Leaf },
  { key: "contribute", label: "Give back", color: "#eab308", icon: HeartHandshake },
  { key: "other", label: "Other", color: "#94a3b8", icon: Sparkles },
];

const CATEGORY_BY_KEY = new Map(CATEGORIES.map((c) => [c.key, c]));

function categoryOf(key: ExperienceCategory) {
  return CATEGORY_BY_KEY.get(key) ?? CATEGORIES[CATEGORIES.length - 1];
}

/** A translucent tint of a category colour, readable on both themes. */
function tint(color: string, percent = 14) {
  return `color-mix(in srgb, ${color} ${percent}%, transparent)`;
}

const STATUSES: { key: ExperienceStatus; label: string; hint: string }[] = [
  { key: "dream", label: "Dream", hint: "Wanted — not placed in time yet" },
  { key: "planned", label: "Planned", hint: "Has a window in your life" },
  { key: "active", label: "In motion", hint: "Happening now" },
  { key: "lived", label: "Lived", hint: "You did it" },
  { key: "released", label: "Released", hint: "Consciously let go" },
];

const OPEN_STATUSES: ExperienceStatus[] = ["dream", "planned", "active"];

/**
 * Experiences split into the chapter their window opens in, the pile that has
 * no window at all, and the ones consciously released.
 */
function groupByChapter(
  experiences: LifeExperience[],
  input: LifeHorizonInput | null
) {
  const byChapter = new Map<string, LifeExperience[]>();
  const unplaced: LifeExperience[] = [];
  const released: LifeExperience[] = [];
  for (const e of experiences) {
    if (e.status === "released") {
      released.push(e);
      continue;
    }
    const start = e.target_age_start ?? e.target_age_end;
    if (start == null || !input) {
      unplaced.push(e);
      continue;
    }
    const key = chapterKeyForAge(start, input);
    byChapter.set(key, [...(byChapter.get(key) ?? []), e]);
  }
  for (const list of byChapter.values()) list.sort(compareExperiences);
  unplaced.sort(compareExperiences);
  return { byChapter, unplaced, released };
}

// ---------------------------------------------------------------------------
// The map
// ---------------------------------------------------------------------------

export function LifeMap() {
  const { data: horizon, isLoading } = useLifeHorizon();
  const { data: experiences = [] } = useLifeExperiences();
  const [draft, setDraft] = useState<null | Partial<LifeExperience>>(null);
  const [showPast, setShowPast] = useState(false);
  const [showReleased, setShowReleased] = useState(false);
  const [filter, setFilter] = useState<ExperienceCategory | null>(null);

  // Nothing here is memoized by hand — the React Compiler does it, and a
  // manual dependency list on a conditionally-built `input` only fights it.
  const now = new Date();
  const input: LifeHorizonInput | null = horizon?.birth_date
    ? {
        birthDate: horizon.birth_date,
        lifeExpectancy: horizon.life_expectancy,
      }
    : null;

  const visible = filter
    ? experiences.filter((e) => e.category === filter)
    : experiences;

  // `now` is only read for today's date, so recomputing per render is fine.
  const chapters = input ? lifeChapters(input, now) : [];

  const { byChapter, unplaced, released } = groupByChapter(visible, input);

  if (isLoading) return null;
  if (!input) return <HorizonSetup horizon={horizon ?? null} />;

  const progress = lifeProgress(input, now);
  const open = experiences.filter((e) => OPEN_STATUSES.includes(e.status));
  const lived = experiences.filter((e) => e.status === "lived");
  const soon = open.filter((e) => experienceWindow(e, input, now)?.closingSoon);

  return (
    <div>
      <LifeBar
        horizon={horizon!}
        input={input}
        chapters={chapters}
        experiences={visible}
        onPickAge={(age) =>
          setDraft({ target_age_start: age, target_age_end: age, status: "planned" })
        }
      />

      {/* What the map says back to you, in one line. */}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-soft">
        <span>
          <strong className="text-ink">{open.length}</strong> to live
        </span>
        <span>
          <strong className="text-ink">{lived.length}</strong> lived
        </span>
        {soon.length > 0 && (
          <span className="text-amber-700">
            <strong>{soon.length}</strong> window{soon.length === 1 ? "" : "s"} closing
            within 2 years
          </span>
        )}
        {unplaced.length > 0 && (
          <span className="text-ink-faint">
            {unplaced.length} still without a time
          </span>
        )}
      </div>

      {/* Category filter */}
      <div className="mt-4 flex flex-wrap gap-1.5">
        {CATEGORIES.map((c) => {
          const count = experiences.filter((e) => e.category === c.key).length;
          const on = filter === c.key;
          return (
            <button
              key={c.key}
              onClick={() => setFilter(on ? null : c.key)}
              className={clsx(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors cursor-pointer",
                on ? "border-transparent font-medium" : "border-line text-ink-soft hover:text-ink"
              )}
              style={on ? { background: tint(c.color, 18), color: c.color } : undefined}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: c.color }}
              />
              {c.label}
              {count > 0 && <span className="text-ink-faint">{count}</span>}
            </button>
          );
        })}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Your chapters</h2>
        <Button
          size="sm"
          variant="primary"
          onClick={() => setDraft({ status: "dream" })}
        >
          <Plus size={13} /> Add experience
        </Button>
      </div>

      {/* Dreams with no time yet — the pile you are asked to place. */}
      {unplaced.length > 0 && (
        <section className="mt-3 rounded-xl border border-dashed border-line p-4">
          <div className="flex items-center gap-1.5">
            <CircleDashed size={14} className="text-ink-faint" />
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
              Not placed in life yet · {unplaced.length}
            </h3>
          </div>
          <p className="mt-1 text-xs text-ink-soft">
            A dream without a window is a dream that keeps sliding. Give each one
            an age.
          </p>
          <div className="mt-3 flex flex-col gap-1.5">
            {unplaced.map((e) => (
              <ExperienceCard
                key={e.id}
                experience={e}
                input={input}
                now={now}
                onOpen={() => setDraft(e)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Chapters */}
      <div className="mt-4 flex flex-col gap-3">
        {chapters
          .filter((c) => showPast || !c.isPast || (byChapter.get(c.key)?.length ?? 0) > 0)
          .map((chapter) => (
            <ChapterSection
              key={chapter.key}
              chapter={chapter}
              experiences={byChapter.get(chapter.key) ?? []}
              input={input}
              now={now}
              onOpen={(e) => setDraft(e)}
              onAdd={() =>
                setDraft(
                  chapter.isPast
                    ? {
                        // Past chapters are for recording, not planning.
                        target_age_start: chapter.startAge,
                        target_age_end: chapter.endAge ?? chapter.startAge + 9,
                        status: "lived",
                      }
                    : {
                        target_age_start: Math.max(chapter.startAge, progress.age),
                        target_age_end: chapter.endAge ?? chapter.startAge + 9,
                        status: "planned",
                      }
                )
              }
            />
          ))}
      </div>

      {chapters.some((c) => c.isPast) && (
        <button
          onClick={() => setShowPast((v) => !v)}
          className="mt-3 flex items-center gap-1 text-xs text-ink-faint hover:text-ink cursor-pointer"
        >
          {showPast ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          {showPast ? "Hide" : "Show"} the chapters already behind you
        </button>
      )}

      {/* Released — kept, because choosing includes choosing not to. */}
      {released.length > 0 && (
        <section className="mt-6">
          <button
            onClick={() => setShowReleased((v) => !v)}
            className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-ink-faint hover:text-ink cursor-pointer"
          >
            {showReleased ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            Released · {released.length}
          </button>
          {showReleased && (
            <div className="mt-2 flex flex-col gap-1.5 opacity-60">
              {released.map((e) => (
                <ExperienceCard
                  key={e.id}
                  experience={e}
                  input={input}
                  now={now}
                  onOpen={() => setDraft(e)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {experiences.length === 0 && (
        <div className="mt-4">
          <EmptyState
            icon={<MapIcon size={20} />}
            title="Nothing on the map yet"
            hint="Start with the ones that have a deadline life sets for you — things that need a young body, small children, or living parents."
            action={
              <Button variant="primary" size="sm" onClick={() => setDraft({ status: "dream" })}>
                <Plus size={13} /> Add your first experience
              </Button>
            }
          />
        </div>
      )}

      {draft && (
        <ExperienceDialog
          draft={draft}
          input={input}
          chapters={chapters}
          now={now}
          onClose={() => setDraft(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header: the finite scale everything else is read against
// ---------------------------------------------------------------------------

function LifeBar({
  horizon,
  input,
  chapters,
  experiences,
  onPickAge,
}: {
  horizon: LifeHorizon;
  input: LifeHorizonInput;
  chapters: LifeChapter[];
  experiences: LifeExperience[];
  onPickAge: (age: number) => void;
}) {
  const saveHorizon = useSaveLifeHorizon();
  const [editing, setEditing] = useState(false);
  const now = new Date();
  const progress = lifeProgress(input, now);

  // Which experiences touch which year of life — this is what turns the grid
  // from a memento mori into a plan.
  const byAge = new Map<number, LifeExperience[]>();
  for (const e of experiences) {
    if (e.status === "released") continue;
    const start = e.target_age_start ?? e.target_age_end;
    if (start == null) continue;
    const end = e.target_age_end ?? start;
    for (let a = start; a <= end; a++) {
      byAge.set(a, [...(byAge.get(a) ?? []), e]);
    }
  }

  const decades = chapters.filter((c) => c.endAge != null);
  // Experiences whose window has not closed yet — the ones the years ahead
  // still hold. Counting years instead would inflate with every wide window.
  const ahead = experiences.filter(
    (e) =>
      e.status !== "released" &&
      (e.target_age_end ?? e.target_age_start ?? -1) >= progress.age
  ).length;

  return (
    <section className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-[15rem] flex-1">
          <p className="text-sm text-ink-soft">
            You are <strong className="text-ink">{progress.age}</strong>. Planning
            to <strong className="text-ink">{input.lifeExpectancy}</strong> leaves
            you
          </p>
          <p className="text-3xl font-semibold leading-tight">
            {progress.yearsLeft} more years
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            {ahead === 0
              ? "Nothing is placed in them yet."
              : `${ahead} experience${ahead === 1 ? " is" : "s are"} placed in them.`}
          </p>
          <button
            onClick={() => setEditing((v) => !v)}
            className="mt-2 text-xs text-ink-faint underline-offset-2 hover:text-ink hover:underline cursor-pointer"
          >
            {progress.percentLived}% of the horizon spent · adjust
          </button>
          <p className="mt-4 max-w-xs text-[11px] leading-relaxed text-ink-faint">
            Each square is a year. Grey is spent, a solid square is where an
            experience starts, the tint behind it is the window it can happen
            in. Click any year to put something in it.
          </p>
        </div>

        {/* One square per year of life. Grey is spent, outlined is open, a
            solid square is where an experience starts, a tinted band is the
            window it may happen in. */}
        <div className="flex flex-col gap-1">
          {decades.map((c) => (
            <div key={c.key} className="flex items-center gap-1.5">
              <span className="w-5 shrink-0 text-right text-[10px] tabular-nums text-ink-faint">
                {c.startAge}
              </span>
              <div className="flex gap-1">
                {Array.from({ length: 10 }, (_, i) => c.startAge + i).map((age) => {
                  const year = yearAtAge(input.birthDate, age);
                  const here = byAge.get(age) ?? [];
                  const starts = here.filter(
                    (e) => (e.target_age_start ?? e.target_age_end) === age
                  );
                  const spent = age < progress.age;
                  const isNow = age === progress.age;
                  const beyond = age > input.lifeExpectancy;
                  const color = here.length
                    ? categoryOf((starts[0] ?? here[0]).category).color
                    : null;
                  return (
                    <button
                      key={age}
                      onClick={() => onPickAge(age)}
                      title={`Age ${age} · ${year}${
                        here.length
                          ? ` — ${here.map((e) => e.title).join(", ")}`
                          : " — nothing planned"
                      }`}
                      aria-label={`Age ${age}, ${year}, ${here.length} experiences`}
                      className={clsx(
                        "h-5 w-5 rounded-[3px] border transition-transform hover:scale-125 cursor-pointer",
                        isNow && "ring-2 ring-accent ring-offset-1 ring-offset-surface",
                        !color && spent && "border-transparent bg-ink/15",
                        !color && !spent && !beyond && "border-line bg-transparent",
                        !color && beyond && "border-dashed border-line/60 bg-transparent"
                      )}
                      style={
                        color
                          ? {
                              background: starts.length
                                ? color
                                : tint(color, spent ? 18 : 28),
                              borderColor: starts.length ? "transparent" : tint(color, 45),
                              opacity: spent ? 0.55 : 1,
                            }
                          : undefined
                      }
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {editing && (
        <div className="mt-4 flex flex-wrap items-end gap-3 rounded-lg bg-canvas p-3">
          <label className="w-44 text-xs text-ink-soft">
            Born
            <Input
              type="date"
              className="mt-1"
              value={horizon.birth_date ?? ""}
              onChange={(e) =>
                saveHorizon.mutate({ birth_date: e.target.value || null })
              }
            />
          </label>
          <label className="w-32 text-xs text-ink-soft">
            Planning to age
            <Input
              type="number"
              min={40}
              max={120}
              className="mt-1"
              defaultValue={horizon.life_expectancy}
              onBlur={(e) => {
                const v = Math.min(120, Math.max(40, +e.target.value || 85));
                if (v !== horizon.life_expectancy)
                  saveHorizon.mutate({ life_expectancy: v });
              }}
            />
          </label>
          <p className="max-w-xs text-[11px] text-ink-faint">
            Not a prediction — the horizon you choose to plan against. Shorten it
            and the map gets honest fast.
          </p>
        </div>
      )}

    </section>
  );
}

// ---------------------------------------------------------------------------
// Chapters
// ---------------------------------------------------------------------------

function ChapterSection({
  chapter,
  experiences,
  input,
  now,
  onOpen,
  onAdd,
}: {
  chapter: LifeChapter;
  experiences: LifeExperience[];
  input: LifeHorizonInput;
  now: Date;
  onOpen: (e: LifeExperience) => void;
  onAdd: () => void;
}) {
  const years =
    chapter.endYear == null
      ? `${chapter.startYear} →`
      : `${chapter.startYear}–${chapter.endYear}`;
  const ages =
    chapter.endAge == null
      ? `age ${chapter.startAge}+`
      : `age ${chapter.startAge}–${chapter.endAge}`;

  return (
    <section
      className={clsx(
        "rounded-xl border bg-surface p-4",
        chapter.isCurrent ? "border-accent" : "border-line",
        chapter.isPast && "opacity-60"
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          {chapter.label}
          {chapter.isCurrent && (
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-medium text-accent">
              you are here
            </span>
          )}
        </h3>
        <span className="text-[11px] text-ink-faint">
          {ages} · {years}
        </span>
      </div>

      {chapter.isCurrent && chapter.progress != null && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-ink/10">
          <div
            className="h-full rounded-full bg-accent"
            style={{ width: `${Math.round(chapter.progress * 100)}%` }}
          />
        </div>
      )}

      {experiences.length === 0 ? (
        <button
          onClick={onAdd}
          className="mt-3 flex w-full items-center gap-1.5 rounded-lg border border-dashed border-line px-3 py-2.5 text-left text-xs text-ink-faint hover:border-accent hover:text-accent cursor-pointer"
        >
          <Plus size={13} />
          {chapter.isPast
            ? "Add something you lived in this chapter"
            : `Nothing here yet — what do you want ${
                chapter.key === "beyond" ? "life to hold then" : chapter.label.toLowerCase() + " to hold"
              }?`}
        </button>
      ) : (
        <>
          <div className="mt-3 flex flex-col gap-1.5">
            {experiences.map((e) => (
              <ExperienceCard
                key={e.id}
                experience={e}
                input={input}
                now={now}
                onOpen={() => onOpen(e)}
              />
            ))}
          </div>
          <button
            onClick={onAdd}
            className="mt-2 flex items-center gap-1 text-xs text-ink-faint hover:text-accent cursor-pointer"
          >
            <Plus size={12} /> Add to this chapter
          </button>
        </>
      )}
    </section>
  );
}

function ExperienceCard({
  experience,
  input,
  now,
  onOpen,
}: {
  experience: LifeExperience;
  input: LifeHorizonInput;
  now: Date;
  onOpen: () => void;
}) {
  const category = categoryOf(experience.category);
  const Icon = category.icon;
  const window = experienceWindow(experience, input, now);
  const lived = experience.status === "lived";

  return (
    <button
      onClick={onOpen}
      className="group flex w-full items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2.5 text-left hover:border-accent cursor-pointer"
    >
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
        style={{ background: tint(category.color, 16), color: category.color }}
      >
        {lived ? <Check size={14} /> : <Icon size={14} />}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={clsx(
            "block text-sm font-medium [overflow-wrap:anywhere] line-clamp-2",
            lived && "text-ink-soft line-through decoration-ink-faint",
            experience.status === "released" && "text-ink-faint line-through"
          )}
        >
          {experience.title}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-ink-faint">
          <span>{window?.label ?? "no time chosen"}</span>
          {experience.with_whom && <span>with {experience.with_whom}</span>}
          {experience.status === "active" && (
            <span className="font-medium text-accent">in motion</span>
          )}
        </span>
      </span>
      {window?.missed && (
        <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-600">
          window passed
        </span>
      )}
      {window?.closingSoon && !window.missed && (
        <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
          closing soon
        </span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Add / edit
// ---------------------------------------------------------------------------

function ExperienceDialog({
  draft,
  input,
  chapters,
  now,
  onClose,
}: {
  draft: Partial<LifeExperience>;
  input: LifeHorizonInput;
  chapters: LifeChapter[];
  now: Date;
  onClose: () => void;
}) {
  const [form, setForm] = useState<Partial<LifeExperience>>(draft);
  const { data: values = [] } = useLifeValues();
  const save = useSaveLifeExperience();
  const remove = useDeleteLifeExperience();

  const age = ageOn(input.birthDate, now);
  const patch = (p: Partial<LifeExperience>) => setForm((f) => ({ ...f, ...p }));

  function setWindow(start: number | null, end: number | null) {
    patch({
      target_age_start: start,
      target_age_end: end,
      status:
        start == null
          ? form.status === "planned"
            ? "dream"
            : form.status
          : form.status === "dream" || !form.status
            ? "planned"
            : form.status,
    });
  }

  async function submit() {
    if (!form.title?.trim()) return;
    await save.mutateAsync({
      ...form,
      title: form.title.trim(),
      category: form.category ?? "other",
      status: form.status ?? "dream",
    });
    onClose();
  }

  const window = experienceWindow(
    {
      target_age_start: form.target_age_start ?? null,
      target_age_end: form.target_age_end ?? null,
      status: form.status ?? "dream",
    },
    input,
    now
  );

  const futureChapters = chapters.filter(
    (c) => c.endAge == null || c.endAge >= age
  );

  return (
    <Dialog
      open
      onClose={onClose}
      wide
      title={form.id ? "Experience" : "New life experience"}
    >
      <div className="thin-scroll max-h-[62vh] overflow-y-auto">
        <div className="flex flex-col gap-4 p-4">
          <Input
            autoFocus
            placeholder="What do you want to experience?"
            value={form.title ?? ""}
            onChange={(e) => patch({ title: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />

          {/* Category */}
          <div>
            <p className="mb-1.5 text-xs font-medium text-ink-soft">Kind of experience</p>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((c) => {
                const on = (form.category ?? "other") === c.key;
                const Icon = c.icon;
                return (
                  <button
                    key={c.key}
                    onClick={() => patch({ category: c.key })}
                    className={clsx(
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs cursor-pointer",
                      on ? "border-transparent font-medium" : "border-line text-ink-soft hover:text-ink"
                    )}
                    style={on ? { background: tint(c.color, 18), color: c.color } : undefined}
                  >
                    <Icon size={12} />
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* The point of the whole feature: choosing when. */}
          <div>
            <p className="mb-1.5 text-xs font-medium text-ink-soft">
              When in your life?
            </p>
            <div className="flex flex-wrap gap-1.5">
              <WindowChip
                label="This year"
                active={form.target_age_start === age && form.target_age_end === age}
                onClick={() => setWindow(age, age)}
              />
              <WindowChip
                label="Next 3 years"
                active={form.target_age_start === age && form.target_age_end === age + 3}
                onClick={() => setWindow(age, age + 3)}
              />
              <WindowChip
                label={`Before ${Math.floor(age / 10) * 10 + 10}`}
                active={
                  form.target_age_start === age &&
                  form.target_age_end === Math.floor(age / 10) * 10 + 9
                }
                onClick={() => setWindow(age, Math.floor(age / 10) * 10 + 9)}
              />
              {futureChapters.map((c) => (
                <WindowChip
                  key={c.key}
                  label={c.label.replace("Your ", "In my ")}
                  active={
                    form.target_age_start === c.startAge &&
                    form.target_age_end === (c.endAge ?? c.startAge + 9)
                  }
                  onClick={() => setWindow(c.startAge, c.endAge ?? c.startAge + 9)}
                />
              ))}
              <WindowChip
                label="Not yet — keep it a dream"
                active={form.target_age_start == null && form.target_age_end == null}
                onClick={() => setWindow(null, null)}
              />
            </div>

            <div className="mt-2.5 flex flex-wrap items-end gap-2">
              <label className="w-24 text-[11px] text-ink-faint">
                From age
                <Input
                  type="number"
                  min={0}
                  max={120}
                  className="mt-1"
                  value={form.target_age_start ?? ""}
                  onChange={(e) =>
                    setWindow(
                      e.target.value === "" ? null : +e.target.value,
                      form.target_age_end ?? null
                    )
                  }
                />
              </label>
              <label className="w-24 text-[11px] text-ink-faint">
                To age
                <Input
                  type="number"
                  min={0}
                  max={120}
                  className="mt-1"
                  value={form.target_age_end ?? ""}
                  onChange={(e) =>
                    setWindow(
                      form.target_age_start ?? null,
                      e.target.value === "" ? null : +e.target.value
                    )
                  }
                />
              </label>
              <p className="pb-2 text-xs text-ink-soft">
                {window ? window.label : "Nothing chosen — it stays a dream"}
              </p>
            </div>
            {window?.missed && (
              <p className="mt-1.5 text-xs text-red-600">
                That window has already closed. Move it, or release it on purpose.
              </p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-ink-soft">
              With whom
              <Input
                className="mt-1"
                placeholder="Alone, with Eli, with the kids…"
                value={form.with_whom ?? ""}
                onChange={(e) => patch({ with_whom: e.target.value || null })}
              />
            </label>
            <label className="text-xs text-ink-soft">
              Serves which value
              <Select
                className="mt-1 h-9 w-full"
                value={form.value_id ?? ""}
                onChange={(e) => patch({ value_id: e.target.value || null })}
              >
                <option value="">No value link</option>
                {values.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </Select>
            </label>
          </div>

          <Textarea
            rows={2}
            placeholder="Why this one? What would it mean to have lived it?"
            value={form.notes ?? ""}
            onChange={(e) => patch({ notes: e.target.value || null })}
          />

          {/* Status */}
          <div>
            <p className="mb-1.5 text-xs font-medium text-ink-soft">Where it stands</p>
            <div className="flex flex-wrap gap-1.5">
              {STATUSES.map((s) => (
                <button
                  key={s.key}
                  title={s.hint}
                  onClick={() =>
                    patch({
                      status: s.key,
                      lived_on:
                        s.key === "lived"
                          ? (form.lived_on ?? toDateKey(now))
                          : form.lived_on,
                    })
                  }
                  className={clsx(
                    "rounded-full border px-2.5 py-1 text-xs cursor-pointer",
                    (form.status ?? "dream") === s.key
                      ? "border-accent bg-accent-soft font-medium text-accent"
                      : "border-line text-ink-soft hover:text-ink"
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {(form.status === "lived" || form.status === "released") && (
            <div className="flex flex-col gap-2 rounded-lg bg-canvas p-3">
              {form.status === "lived" && (
                <label className="block w-44 text-xs text-ink-soft">
                  Lived on
                  <Input
                    type="date"
                    className="mt-1"
                    value={form.lived_on ?? ""}
                    onChange={(e) => patch({ lived_on: e.target.value || null })}
                  />
                </label>
              )}
              <Textarea
                rows={2}
                placeholder={
                  form.status === "lived"
                    ? "What was it actually like?"
                    : "Why are you letting this one go?"
                }
                value={form.reflection ?? ""}
                onChange={(e) => patch({ reflection: e.target.value || null })}
              />
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-line px-4 py-2.5">
        {form.id ? (
          <Button
            variant="danger"
            size="sm"
            onClick={() => {
              remove.mutate(form.id!);
              onClose();
            }}
          >
            <Trash2 size={13} /> Delete
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!form.title?.trim()} onClick={submit}>
            Save
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function WindowChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "rounded-full border px-2.5 py-1 text-xs cursor-pointer",
        active
          ? "border-accent bg-accent-soft font-medium text-accent"
          : "border-line text-ink-soft hover:text-ink"
      )}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// First run
// ---------------------------------------------------------------------------

function HorizonSetup({ horizon }: { horizon: LifeHorizon | null }) {
  const save = useSaveLifeHorizon();
  const [birthDate, setBirthDate] = useState(horizon?.birth_date ?? "");
  const [expectancy, setExpectancy] = useState(horizon?.life_expectancy ?? 85);

  return (
    <div className="rounded-xl border border-line bg-surface p-6">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <Heart size={16} className="text-rose-500" /> Draw your lifetime map
      </h2>
      <p className="mt-1 max-w-md text-sm text-ink-soft">
        Experiences get placed into windows of your life — “in my 40s”, “before
        the kids leave” — not onto dates. For that, the map needs a scale.
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="w-44 text-xs text-ink-soft">
          Your birth date
          <Input
            type="date"
            className="mt-1"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
          />
        </label>
        <label className="w-32 text-xs text-ink-soft">
          Planning to age
          <Input
            type="number"
            min={40}
            max={120}
            className="mt-1"
            value={expectancy}
            onChange={(e) => setExpectancy(+e.target.value)}
          />
        </label>
        <Button
          variant="primary"
          disabled={!birthDate}
          onClick={() =>
            save.mutate({
              birth_date: birthDate,
              life_expectancy: Math.min(120, Math.max(40, expectancy || 85)),
            })
          }
        >
          Draw the map
        </Button>
      </div>
      <p className="mt-3 text-[11px] text-ink-faint">
        Private to you — it lives in your personal horizon data, never in a
        shared space.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compact section for the Goals & values dashboard
// ---------------------------------------------------------------------------

export function LifeExperiencesSummary() {
  const { data: horizon } = useLifeHorizon();
  const { data: experiences = [] } = useLifeExperiences();
  const now = new Date();

  const input: LifeHorizonInput | null = horizon?.birth_date
    ? { birthDate: horizon.birth_date, lifeExpectancy: horizon.life_expectancy }
    : null;

  const open = experiences.filter((e) => OPEN_STATUSES.includes(e.status));
  const lived = experiences.filter((e) => e.status === "lived").length;
  const placed = input
    ? [...open]
        .filter((e) => e.target_age_start != null || e.target_age_end != null)
        .sort(compareExperiences)
        .filter((e) => !experienceWindow(e, input, now)?.missed)
    : [];
  const next = placed.slice(0, 3);
  const unplaced = open.filter(
    (e) => e.target_age_start == null && e.target_age_end == null
  ).length;
  const progress = input ? lifeProgress(input, now) : null;

  return (
    <section className="mb-10">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <MapIcon size={15} className="text-sky-500" /> Life experiences
        </h2>
        <Link
          href="/experiences"
          className="text-xs font-medium text-accent hover:underline"
        >
          Open lifetime map →
        </Link>
      </div>

      {!input ? (
        <EmptyState
          icon={<MapIcon size={20} />}
          title="What do you want to have lived?"
          hint="Place the experiences you want onto the years you have left, so the choosing happens on purpose."
          action={
            <Link href="/experiences">
              <Button size="sm" variant="primary">
                Draw your lifetime map
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="rounded-xl border border-line bg-surface p-4">
          <p className="text-sm text-ink-soft">
            <strong className="text-ink">{progress!.yearsLeft} years</strong> on
            the map · <strong className="text-ink">{open.length}</strong> to live
            · <strong className="text-ink">{lived}</strong> lived
          </p>
          {next.length > 0 ? (
            <div className="mt-3 flex flex-col gap-1.5">
              {next.map((e) => {
                const c = categoryOf(e.category);
                const w = experienceWindow(e, input, now);
                return (
                  <Link
                    key={e.id}
                    href="/experiences"
                    className="flex items-center gap-2.5 rounded-lg border border-line px-3 py-2 hover:border-accent"
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: c.color }}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm">{e.title}</span>
                    <span className="shrink-0 text-[11px] text-ink-faint">
                      {w?.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="mt-2 text-xs text-ink-faint">
              Nothing placed in time yet.
            </p>
          )}
          {unplaced > 0 && (
            <p className="mt-2 text-[11px] text-ink-faint">
              {unplaced} more waiting to be given a time.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
