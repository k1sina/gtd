"use client";

import { QUADRANT_LABELS, quadrant } from "@gtd/shared";
import clsx from "clsx";

function Scale({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 text-xs text-ink-soft">{label}</span>
      <div className="flex overflow-hidden rounded-md border border-line">
        {[1, 2, 3, 4].map((n) => (
          <button
            key={n}
            onClick={() => onChange(n)}
            className={clsx(
              "h-7 w-8 text-xs font-medium transition-colors cursor-pointer",
              n === value
                ? "bg-accent text-white"
                : "bg-surface text-ink-soft hover:bg-canvas",
              n > 1 && "border-l border-line"
            )}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

const QUADRANT_TEXT: Record<string, string> = {
  do: "text-q-do",
  schedule: "text-q-schedule",
  delegate: "text-q-delegate",
  eliminate: "text-q-eliminate",
};

export function PriorityPicker({
  urgency,
  importance,
  onChange,
}: {
  urgency: number;
  importance: number;
  onChange: (patch: { urgency?: number; importance?: number }) => void;
}) {
  const q = quadrant(urgency, importance);
  return (
    <div className="flex flex-col gap-2">
      <Scale
        label="Importance"
        value={importance}
        onChange={(v) => onChange({ importance: v })}
      />
      <Scale
        label="Urgency"
        value={urgency}
        onChange={(v) => onChange({ urgency: v })}
      />
      <p className={clsx("text-xs font-semibold", QUADRANT_TEXT[q])}>
        → {QUADRANT_LABELS[q]}
      </p>
    </div>
  );
}
