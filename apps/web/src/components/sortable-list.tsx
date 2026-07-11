"use client";

import clsx from "clsx";
import { GripVertical } from "lucide-react";
import { useRef, useState } from "react";

/**
 * Drag-to-reorder wrapper: a grip handle per row (pointer events, so mouse
 * and touch both work — same pattern as the priority matrix) plus ArrowUp /
 * ArrowDown on the focused grip for keyboards. The drop only reports
 * (from, to); persisting is the caller's job.
 */
export function SortableList<T extends { id: string }>({
  items,
  onMove,
  children,
}: {
  items: T[];
  /** Move items[from] to display position to (indices in `items`). */
  onMove: (from: number, to: number) => void;
  children: (item: T) => React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef(new Map<number, HTMLDivElement>());
  // Row midpoints frozen at drag start (rows never reflow mid-drag: the drop
  // indicator is absolutely positioned). Only read in pointer handlers.
  const mids = useRef<number[]>([]);
  const [drag, setDrag] = useState<{
    from: number;
    slot: number;
    /** Container-relative row tops + list bottom, for the drop indicator. */
    tops: number[];
    bottom: number;
  } | null>(null);

  const canDrag = items.length > 1;

  function beginDrag(e: React.PointerEvent<HTMLButtonElement>, index: number) {
    if (!canDrag || (e.button !== 0 && e.pointerType === "mouse")) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Capture can fail (e.g. pointer already gone); tracking still works.
    }
    const rects = items.map((_, i) =>
      rowRefs.current.get(i)?.getBoundingClientRect()
    );
    const origin = containerRef.current?.getBoundingClientRect().top ?? 0;
    mids.current = rects.map((r) => (r ? (r.top + r.bottom) / 2 : 0));
    setDrag({
      from: index,
      slot: index,
      tops: rects.map((r) => (r ? r.top - origin : 0)),
      bottom: rects.at(-1) ? rects.at(-1)!.bottom - origin : 0,
    });
  }

  function trackDrag(e: React.PointerEvent<HTMLButtonElement>) {
    if (!drag) return;
    const slot = mids.current.filter((m) => m < e.clientY).length;
    setDrag((d) => (d && d.slot !== slot ? { ...d, slot } : d));
  }

  function endDrag(commit: boolean) {
    if (!drag) return;
    const to = drag.slot > drag.from ? drag.slot - 1 : drag.slot;
    if (commit && to !== drag.from) onMove(drag.from, to);
    setDrag(null);
  }

  // Indicator y for the current insertion slot (hidden on no-op slots).
  const indicatorY =
    drag && drag.slot !== drag.from && drag.slot !== drag.from + 1
      ? drag.slot < items.length
        ? drag.tops[drag.slot]
        : drag.bottom
      : null;

  return (
    <div ref={containerRef} className="relative flex flex-col gap-0.5">
      {indicatorY !== null && (
        <div
          className="pointer-events-none absolute inset-x-0 z-10 h-0.5 rounded bg-accent"
          style={{ top: indicatorY - 1 }}
        />
      )}
      {items.map((item, i) => (
        <div
          key={item.id}
          ref={(el) => {
            if (el) rowRefs.current.set(i, el);
            else rowRefs.current.delete(i);
          }}
          className={clsx(
            "group/sort flex items-start",
            drag?.from === i && "opacity-40"
          )}
        >
          <button
            type="button"
            aria-label="Reorder (drag, or arrow keys)"
            title="Drag to reorder"
            disabled={!canDrag}
            onPointerDown={(e) => beginDrag(e, i)}
            onPointerMove={trackDrag}
            onPointerUp={() => endDrag(true)}
            onPointerCancel={() => endDrag(false)}
            onKeyDown={(e) => {
              if (e.key === "ArrowUp" && i > 0) {
                e.preventDefault();
                onMove(i, i - 1);
              } else if (e.key === "ArrowDown" && i < items.length - 1) {
                e.preventDefault();
                onMove(i, i + 1);
              }
            }}
            className={clsx(
              "mt-2.5 shrink-0 touch-none rounded p-0.5 text-ink-faint",
              canDrag
                ? "cursor-grab opacity-0 hover:text-ink-soft focus-visible:opacity-100 group-hover/sort:opacity-100 active:cursor-grabbing [@media(hover:none)]:opacity-50"
                : "invisible"
            )}
          >
            <GripVertical size={13} />
          </button>
          <div className="min-w-0 flex-1">{children(item)}</div>
        </div>
      ))}
    </div>
  );
}
