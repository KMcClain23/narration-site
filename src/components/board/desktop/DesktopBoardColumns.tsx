"use client";

import { useState } from "react";
import {
  DndContext, DragOverlay, MouseSensor, useSensor, useSensors, useDroppable,
  type DragEndEvent, type DragStartEvent, type DragOverEvent,
} from "@dnd-kit/core";
import { BoardCard } from "@/components/admin/BoardCard";
import type { BoardV2Card } from "@/components/admin/board-card-utils";
import { ReleasedDropZone, RELEASED_DROPZONE_ID } from "@/components/admin/ReleasedDropZone";
import { SubgroupDivider } from "@/components/admin/SubgroupDivider";
import { adminType } from "@/lib/design-tokens";
import { FilterChip } from "@/components/board/FilterChip";
import { BoardSearch } from "@/components/board/BoardSearch";
import { PIPELINE_BUCKETS, PRODUCTION_SUBGROUPS, type PipelineBucket, type DateFilter } from "@/components/board/board-filters";

// Unchanged from pre-Stage-2 board/page.tsx — extracted verbatim (plus the
// header row) so mobile can render a completely different layout alongside
// it without touching drag-and-drop at all. Owns its own DnD state; only
// calls back up for the cross-cutting concerns (status updates, the shared
// Release-confirm dialog, the shared Edit modal, first-15 toggle, long-press).
const VALID_DROP_TARGETS = new Set<string>([
  "prepping", "recording", "editing", "thisWeek", "thisMonth", "later", RELEASED_DROPZONE_ID,
]);

// Dropping on any Pipeline subgroup always resets status to 'contracted' —
// the subgroup a card lands in afterward is computed from its own
// completion_date, not from which of the three zones it was dropped on.
const PIPELINE_DROP_IDS = new Set<string>(["thisWeek", "thisMonth", "later"]);

function DroppableSubgroup({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`rounded-lg transition-colors ${isOver ? "bg-surface-raised/40" : ""}`}>
      {children}
    </div>
  );
}

export function DesktopBoardColumns({
  cardsEmpty,
  cards,
  pipelineCards,
  productionCards,
  pipelineFiltered,
  productionFiltered,
  pipelineBuckets,
  productionBuckets,
  releasedCount,
  dateFilter,
  onToggleDateFilter,
  fadingIds,
  onToggleFirst15,
  onLongPress,
  onOpenCard,
  onSearchOpenCard,
  onCreateProject,
  onUpdateStatus,
  onRequestRelease,
}: {
  cardsEmpty: boolean;
  cards: BoardV2Card[];
  pipelineCards: BoardV2Card[];
  productionCards: BoardV2Card[];
  pipelineFiltered: BoardV2Card[];
  productionFiltered: BoardV2Card[];
  pipelineBuckets: Record<PipelineBucket, BoardV2Card[]>;
  productionBuckets: Record<string, BoardV2Card[]>;
  releasedCount: number;
  dateFilter: DateFilter;
  onToggleDateFilter: (f: "week" | "month") => void;
  fadingIds: Set<string>;
  onToggleFirst15: (id: string, complete: boolean) => void;
  onLongPress: (card: BoardV2Card, x: number, y: number) => void;
  onOpenCard: (card: BoardV2Card) => void;
  onSearchOpenCard: (id: string) => void;
  onCreateProject: () => void;
  onUpdateStatus: (id: string, status: string) => void;
  onRequestRelease: (card: BoardV2Card) => void;
}) {
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 8 } }));
  const activeCard = cards.find(c => c.id === activeDragId) ?? null;

  const handleDragStart = (e: DragStartEvent) => {
    setActiveDragId(String(e.active.id));
    document.body.style.cursor = "not-allowed";
  };

  const handleDragOver = (e: DragOverEvent) => {
    const overId = e.over?.id ? String(e.over.id) : null;
    document.body.style.cursor = overId && VALID_DROP_TARGETS.has(overId) ? "grabbing" : "not-allowed";
  };

  const handleDragEnd = (e: DragEndEvent) => {
    document.body.style.cursor = "";
    setActiveDragId(null);
    const { active, over } = e;
    if (!over) return;

    const card = cards.find(c => c.id === active.id);
    if (!card) return;

    if (over.id === RELEASED_DROPZONE_ID) {
      onRequestRelease(card);
      return;
    }

    const overId = String(over.id);

    if (PIPELINE_DROP_IDS.has(overId)) {
      if (card.status !== "contracted") onUpdateStatus(card.id, "contracted");
      return;
    }

    if (VALID_DROP_TARGETS.has(overId) && overId !== card.status) {
      onUpdateStatus(card.id, overId);
    }
  };

  const renderCard = (c: BoardV2Card) => (
    <div key={c.id} className={`transition-opacity duration-300 ${fadingIds.has(c.id) ? "opacity-0" : "opacity-100"}`}>
      <BoardCard card={c} onToggleFirst15={onToggleFirst15} onLongPress={onLongPress} onOpen={onOpenCard} />
    </div>
  );

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
      <div className="flex h-[calc(100vh-4rem)] flex-col">
        {/* Header row — does not scroll */}
        <div className="mb-4 flex shrink-0 items-center justify-between gap-4">
          <h1 className={adminType.titleLg}>Board</h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCreateProject}
              className="rounded-full bg-accent-amber px-4 py-2 text-sm font-bold text-background transition hover:brightness-110"
            >
              + New Project
            </button>
            <FilterChip label="Due this week" active={dateFilter === "week"} onClick={() => onToggleDateFilter("week")} />
            <FilterChip label="Due this month" active={dateFilter === "month"} onClick={() => onToggleDateFilter("month")} />
            {/* Last in the row: the chips filter what's drawn, search reaches
                past it to books the board never draws. */}
            <BoardSearch onOpenCard={onSearchOpenCard} />
          </div>
        </div>

        {/* Columns */}
        {cardsEmpty ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4">
            <p className={adminType.body}>No active projects</p>
            <button
              onClick={onCreateProject}
              className="rounded-full bg-accent-amber px-5 py-2.5 text-sm font-bold text-background transition hover:brightness-110"
            >
              + New Project
            </button>
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-[1fr_1fr_120px] gap-4">
            {/* Column 1: Pipeline */}
            <div className="flex min-h-0 flex-col">
              <div className="mb-3 flex shrink-0 items-baseline gap-2">
                <h2 className={adminType.title}>Pipeline</h2>
                <span className="text-sm text-text-muted">
                  ({pipelineCards.length}){dateFilter ? ` · ${pipelineFiltered.length} shown` : ""}
                </span>
              </div>
              <div className="admin-scrollbar min-h-0 flex-1 overflow-y-auto pr-1">
                {PIPELINE_BUCKETS.map(bucket => (
                  <DroppableSubgroup key={bucket.id} id={bucket.id}>
                    <div className="mb-5">
                      <SubgroupDivider label={bucket.label} />
                      {pipelineBuckets[bucket.id].length === 0 ? (
                        <p className="text-[13px] text-text-faint">— no books —</p>
                      ) : (
                        <div className="space-y-3">{pipelineBuckets[bucket.id].map(renderCard)}</div>
                      )}
                    </div>
                  </DroppableSubgroup>
                ))}
              </div>
            </div>

            {/* Column 2: In Production */}
            <div className="flex min-h-0 flex-col">
              <div className="mb-3 flex shrink-0 items-baseline gap-2">
                <h2 className={adminType.title}>In Production</h2>
                <span className="text-sm text-text-muted">
                  ({productionCards.length}){dateFilter ? ` · ${productionFiltered.length} shown` : ""}
                </span>
              </div>
              <div className="admin-scrollbar min-h-0 flex-1 overflow-y-auto pr-1">
                {PRODUCTION_SUBGROUPS.map(s => {
                  const groupCards = productionBuckets[s.id];
                  return (
                    <DroppableSubgroup key={s.id} id={s.id}>
                      <div className="mb-5">
                        <SubgroupDivider label={s.label} />
                        {groupCards.length === 0 ? (
                          <p className="text-[13px] text-text-faint">— no books —</p>
                        ) : (
                          <div className="space-y-3">{groupCards.map(renderCard)}</div>
                        )}
                      </div>
                    </DroppableSubgroup>
                  );
                })}
              </div>
            </div>

            {/* Released drop-zone */}
            <ReleasedDropZone releasedCount={releasedCount} isDragActive={activeDragId !== null} />
          </div>
        )}
      </div>

      <DragOverlay>
        {activeCard && (
          <div style={{ opacity: 0.45 }}>
            <BoardCard card={activeCard} onToggleFirst15={() => {}} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
