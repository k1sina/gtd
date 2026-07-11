"use client";

import {
  QUADRANT_LABELS,
  fractionFromGridValue,
  gridValueFromFraction,
  quadrant,
} from "@gtd/shared";
import clsx from "clsx";
import { useRef, useState } from "react";

const QUADRANT_TEXT: Record<string, string> = {
  do: "text-q-do",
  schedule: "text-q-schedule",
  delegate: "text-q-delegate",
  eliminate: "text-q-eliminate",
};

const QUADRANT_DOT: Record<string, string> = {
  do: "bg-q-do",
  schedule: "bg-q-schedule",
  delegate: "bg-q-delegate",
  eliminate: "bg-q-eliminate",
};

const clamp = (v: number) => Math.min(4, Math.max(1, v));

/**
 * Eisenhower matrix input: drag (or tap / arrow-key) the dot to set urgency
 * (x, 1..4) and importance (y, 1..4 upward) together. Values snap to the 16
 * cell centers; the drag commits a single onChange on release.
 *
 * Note: (2,2) doubles as the "unrated" sentinel elsewhere (matrix page's
 * Unrated bucket) — a dot deliberately placed there is indistinguishable.
 */
export function PriorityMatrix({
  urgency,
  importance,
  onChange,
}: {
  urgency: number;
  importance: number;
  onChange: (patch: { urgency?: number; importance?: number }) => void;
}) {
  const [local, setLocal] = useState<{ urgency: number; importance: number } | null>(null);
  const pointerId = useRef<number | null>(null);

  const shown = local ?? { urgency, importance };
  const q = quadrant(shown.urgency, shown.importance);
  const { fx, fy } = fractionFromGridValue(shown.urgency, shown.importance);

  const valueAt = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return gridValueFromFraction(
      (e.clientX - rect.left) / rect.width,
      (e.clientY - rect.top) / rect.height
    );
  };

  const release = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointerId.current !== null && e.currentTarget.hasPointerCapture(pointerId.current)) {
      e.currentTarget.releasePointerCapture(pointerId.current);
    }
    pointerId.current = null;
  };

  const nudge = (patch: { urgency?: number; importance?: number }) => {
    const next = {
      urgency: clamp(patch.urgency ?? urgency),
      importance: clamp(patch.importance ?? importance),
    };
    if (next.urgency !== urgency || next.importance !== importance) onChange(next);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-stretch gap-1.5">
        <span className="self-center text-[10px] text-ink-faint [writing-mode:vertical-rl] rotate-180">
          Importance →
        </span>
        <div
          role="slider"
          tabIndex={0}
          aria-label="Priority"
          aria-valuemin={1}
          aria-valuemax={4}
          aria-valuenow={shown.urgency}
          aria-valuetext={`Urgency ${shown.urgency} of 4, importance ${shown.importance} of 4 — ${QUADRANT_LABELS[q]}`}
          className="relative aspect-square w-full max-w-56 touch-none select-none overflow-hidden rounded-lg border border-line cursor-crosshair focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          onPointerDown={(e) => {
            if (e.button !== 0 && e.pointerType === "mouse") return;
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {
              // Capture can fail (e.g. pointer already gone); tracking still works.
            }
            pointerId.current = e.pointerId;
            setLocal(valueAt(e));
          }}
          onPointerMove={(e) => {
            if (pointerId.current === null) return;
            const v = valueAt(e);
            setLocal((cur) =>
              cur && cur.urgency === v.urgency && cur.importance === v.importance ? cur : v
            );
          }}
          onPointerUp={(e) => {
            release(e);
            if (local && (local.urgency !== urgency || local.importance !== importance)) {
              onChange(local);
            }
            setLocal(null);
          }}
          onPointerCancel={(e) => {
            release(e);
            setLocal(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape" && local) {
              // Revert the in-flight drag without closing the enclosing dialog.
              e.stopPropagation();
              setLocal(null);
              return;
            }
            const moves: Record<string, { urgency?: number; importance?: number }> = {
              ArrowLeft: { urgency: urgency - 1 },
              ArrowRight: { urgency: urgency + 1 },
              ArrowDown: { importance: importance - 1 },
              ArrowUp: { importance: importance + 1 },
            };
            const move = moves[e.key];
            if (move) {
              e.preventDefault();
              nudge(move);
            }
          }}
        >
          {/* Quadrant tints: importance up, urgency right; split between 2 and 3. */}
          <div className="absolute left-0 top-0 h-1/2 w-1/2 bg-q-schedule/10" />
          <div className="absolute right-0 top-0 h-1/2 w-1/2 bg-q-do/10" />
          <div className="absolute bottom-0 left-0 h-1/2 w-1/2 bg-q-eliminate/15" />
          <div className="absolute bottom-0 right-0 h-1/2 w-1/2 bg-q-delegate/10" />
          {[25, 50, 75].map((p) => (
            <div key={`v${p}`}>
              <div
                className={clsx(
                  "absolute inset-y-0 w-px",
                  p === 50 ? "bg-line" : "bg-line/50"
                )}
                style={{ left: `${p}%` }}
              />
              <div
                className={clsx(
                  "absolute inset-x-0 h-px",
                  p === 50 ? "bg-line" : "bg-line/50"
                )}
                style={{ top: `${p}%` }}
              />
            </div>
          ))}
          <span className="absolute left-1.5 top-1 text-[10px] text-ink-faint">Schedule</span>
          <span className="absolute right-1.5 top-1 text-[10px] text-ink-faint">Do first</span>
          <span className="absolute bottom-1 left-1.5 text-[10px] text-ink-faint">Eliminate</span>
          <span className="absolute bottom-1 right-1.5 text-[10px] text-ink-faint">Delegate</span>
          <div
            className={clsx(
              "absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface shadow",
              QUADRANT_DOT[q],
              !local && "transition-[left,top] duration-100"
            )}
            style={{ left: `${fx * 100}%`, top: `${fy * 100}%` }}
          />
        </div>
      </div>
      <p className="ml-4 max-w-56 text-right text-[10px] text-ink-faint">Urgency →</p>
      <p className={clsx("text-xs font-semibold", QUADRANT_TEXT[q])}>→ {QUADRANT_LABELS[q]}</p>
    </div>
  );
}
