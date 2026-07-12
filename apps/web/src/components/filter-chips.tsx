"use client";

import type { Energy, Task } from "@gtd/shared";
import clsx from "clsx";
import { useEffect, useMemo, useState } from "react";

/**
 * Context-tag + energy filter chips — GTD's engage criteria, shared by every
 * list that supports them. Selections persist per `storageKey` (so being
 * @home in the morning still means @home after lunch); a persisted tag that
 * no longer exists in the list is ignored, not applied invisibly.
 */
export function useTaskFilters(tasks: Task[], storageKey: string) {
  const [tag, setTag] = useState<string | null>(null);
  const [energy, setEnergy] = useState<Energy | null>(null);
  const [restored, setRestored] = useState(false);

  const allTags = useMemo(
    () => [...new Set(tasks.flatMap((t) => t.context_tags))].sort(),
    [tasks]
  );

  // Restore once, after the first real task load (so validation has data).
  // A useState initializer can't do this: localStorage is client-only and
  // reading it there would make the server and client render different HTML.
  useEffect(() => {
    if (restored || tasks.length === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRestored(true);
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? "{}");
      if (typeof saved.tag === "string" && allTags.includes(saved.tag)) {
        setTag(saved.tag);
      }
      if (["low", "medium", "high"].includes(saved.energy)) {
        setEnergy(saved.energy);
      }
    } catch {
      // Corrupt storage — start unfiltered.
    }
  }, [restored, tasks.length, allTags, storageKey]);

  useEffect(() => {
    if (!restored) return;
    localStorage.setItem(storageKey, JSON.stringify({ tag, energy }));
  }, [tag, energy, restored, storageKey]);

  const filtered = useMemo(
    () =>
      tasks.filter(
        (t) =>
          (!tag || t.context_tags.includes(tag)) &&
          (!energy || t.energy === energy)
      ),
    [tasks, tag, energy]
  );

  return { tag, setTag, energy, setEnergy, allTags, filtered };
}

export function FilterChips({
  tag,
  setTag,
  energy,
  setEnergy,
  allTags,
  showEnergy,
}: {
  tag: string | null;
  setTag: (t: string | null) => void;
  energy: Energy | null;
  setEnergy: (e: Energy | null) => void;
  allTags: string[];
  /** Render the energy chips (pass tasks.some(t => t.energy)). */
  showEnergy: boolean;
}) {
  if (allTags.length === 0 && !showEnergy) return null;

  const chip = (
    label: string,
    selected: boolean,
    onClick: () => void
  ) => (
    <button
      key={label}
      onClick={onClick}
      className={clsx(
        "rounded-full border px-2.5 py-1 text-xs cursor-pointer",
        selected
          ? "border-accent bg-accent-soft text-accent font-medium"
          : "border-line text-ink-soft hover:border-accent"
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="mb-4 flex flex-wrap items-center gap-1.5">
      {allTags.map((t) =>
        chip(`@${t}`, tag === t, () => setTag(tag === t ? null : t))
      )}
      {allTags.length > 0 && showEnergy && (
        <span className="mx-1 h-4 border-l border-line" />
      )}
      {showEnergy &&
        (["low", "medium", "high"] as const).map((e) =>
          chip(`${e} energy`, energy === e, () =>
            setEnergy(energy === e ? null : e)
          )
        )}
    </div>
  );
}
