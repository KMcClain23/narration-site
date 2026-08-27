"use client";

import Link from "next/link";
import { useDroppable } from "@dnd-kit/core";
import { Archive } from "lucide-react";
import { adminType } from "@/lib/design-tokens";

// Drop target id the board page checks for in onDragEnd — actually marking
// a card released (with its confirmation dialog) is orchestrated by the
// parent, not this component; this is purely the visual strip + registering
// as a droppable zone.
export const RELEASED_DROPZONE_ID = "released-dropzone";

export function ReleasedDropZone({
  releasedCount,
  isDragActive,
}: {
  releasedCount: number;
  isDragActive: boolean;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: RELEASED_DROPZONE_ID });

  const dragStyles = isDragActive
    ? isOver
      ? "border-solid border-2 border-accent-amber bg-accent-amber/10"
      : "border-solid border-2 border-accent-amber bg-accent-amber/5"
    : "border-dashed border-2 border-[#4b5061] bg-surface-raised/20";

  return (
    <div
      ref={setNodeRef}
      className={`flex h-full w-[120px] shrink-0 flex-col items-center rounded-lg p-3 text-center transition-colors ${dragStyles}`}
    >
      <Link href="/released" className="w-full">
        <p className="text-[18px] font-bold leading-tight text-text-body">Released</p>
      </Link>
      {/* "all-time" is load-bearing, not decoration. This number comes from
          /api/board-v2/released-count, which filters on status alone and
          deliberately does NOT exclude archived books; the /released page it
          links to excludes them. The two agree today only because no released
          book has ever been archived, and the first time one is, a bare
          "12 released" beside a list of 11 reads as a bug — which someone would
          then "fix" by adding the archived filter and quietly destroy the
          career total. Saying which population it counts is what stops that. */}
      <p className={`${adminType.small} mt-1`}>{releasedCount} released all-time</p>

      <div className={`mt-8 flex flex-1 flex-col items-center justify-center gap-2 ${isDragActive ? "animate-pulse" : ""}`}>
        <Archive size={28} className="text-text-faint" />
        {isDragActive && <p className="text-[11px] text-text-faint">Drop to release</p>}
      </div>
    </div>
  );
}
