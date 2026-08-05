"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { PRODUCTION_SUBGROUPS } from "@/components/board/board-filters";

// Extracted from board/page.tsx's inline markup (Mobile Redesign Stage 2) —
// used identically regardless of platform, since long-press already fires
// from mouse-hold on desktop too, not just touch. Gained two new options
// this stage ("Move to Pipeline", "Archive") since mobile drops
// drag-and-drop entirely and has no other quick path to either.
export function BoardActionMenu({
  x,
  y,
  onMoveToStage,
  onMoveToPipeline,
  onMarkReleased,
  onArchive,
}: {
  x: number;
  y: number;
  onMoveToStage: (status: string) => void;
  onMoveToPipeline: () => void;
  onMarkReleased: () => void;
  onArchive: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Starts at the raw long-press point, then clamped to the viewport once
  // the real rendered size is known — a long-press near the right edge (very
  // common on mobile, where the card fills most of the screen width) would
  // otherwise position this fixed-width menu partly off-screen.
  const [pos, setPos] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = 8;
    const left = Math.min(Math.max(margin, x), window.innerWidth - rect.width - margin);
    const top = Math.min(Math.max(margin, y), window.innerHeight - rect.height - margin);
    setPos({ left, top });
  }, [x, y]);

  return (
    <div
      ref={ref}
      className="fixed z-[300] w-52 rounded-xl border border-surface-border bg-surface py-1.5 shadow-2xl"
      style={{ left: pos.left, top: pos.top }}
      onClick={e => e.stopPropagation()}
    >
      {PRODUCTION_SUBGROUPS.map(s => (
        <button
          key={s.id}
          onClick={() => onMoveToStage(s.id)}
          className="block w-full px-4 py-2 text-left text-sm text-text-body transition-colors hover:bg-surface-raised hover:text-text-primary"
        >
          Move to {s.label}
        </button>
      ))}
      <button
        onClick={onMoveToPipeline}
        className="block w-full px-4 py-2 text-left text-sm text-text-body transition-colors hover:bg-surface-raised hover:text-text-primary"
      >
        Move to Pipeline
      </button>
      <button
        onClick={onMarkReleased}
        className="block w-full px-4 py-2 text-left text-sm text-text-body transition-colors hover:bg-surface-raised hover:text-text-primary"
      >
        Mark as Released
      </button>
      <div className="my-1 h-px bg-surface-border" />
      <button
        onClick={onArchive}
        className="block w-full px-4 py-2 text-left text-sm text-alert-red transition-colors hover:bg-alert-red/10"
      >
        Archive
      </button>
    </div>
  );
}
