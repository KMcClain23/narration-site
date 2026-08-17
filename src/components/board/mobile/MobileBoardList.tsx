"use client";

import { useState } from "react";
import Link from "next/link";
import type { BoardV2Card } from "@/components/admin/board-card-utils";
import { SubgroupDivider } from "@/components/admin/SubgroupDivider";
import { adminType } from "@/lib/design-tokens";
import { FilterChip } from "@/components/board/FilterChip";
import { BoardSearch } from "@/components/board/BoardSearch";
import { PIPELINE_BUCKETS, PRODUCTION_SUBGROUPS, type PipelineBucket, type DateFilter } from "@/components/board/board-filters";
import { MobileBoardCard } from "./MobileBoardCard";
import { BoardFAB } from "./BoardFAB";

type Section = "pipeline" | "production";

export function MobileBoardList({
  cardsEmpty,
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
  onSwipeArchive,
  onCreateProject,
}: {
  cardsEmpty: boolean;
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
  onSwipeArchive: (card: BoardV2Card) => void;
  onCreateProject: () => void;
}) {
  // New on mobile — desktop has no equivalent, since Pipeline/In Production
  // are always both visible as side-by-side columns there. Multi-select:
  // both on, both off, or just one; both-or-none both mean "show everything."
  const [sectionFilter, setSectionFilter] = useState<Set<Section>>(new Set());
  const toggleSection = (s: Section) => {
    setSectionFilter(prev => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };
  const onlyPipeline = sectionFilter.size === 1 && sectionFilter.has("pipeline");
  const onlyProduction = sectionFilter.size === 1 && sectionFilter.has("production");
  const showPipeline = !onlyProduction;
  const showProduction = !onlyPipeline;

  const renderCard = (c: BoardV2Card) => (
    <div key={c.id} className={`transition-opacity duration-300 ${fadingIds.has(c.id) ? "opacity-0" : "opacity-100"}`}>
      <MobileBoardCard
        card={c}
        onToggleFirst15={onToggleFirst15}
        onLongPress={onLongPress}
        onOpen={onOpenCard}
        onSwipeArchive={onSwipeArchive}
      />
    </div>
  );

  return (
    <div className="flex flex-col">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className={adminType.titleLg}>Board</h1>
        <Link
          href="/released"
          className="shrink-0 rounded-full border border-surface-border px-3 py-1.5 text-[13px] font-medium text-text-muted transition-colors hover:text-text-primary"
        >
          Released ({releasedCount})
        </Link>
      </div>

      {/* Above the chips: the chips narrow what is drawn, search reaches past
          the board to books it never draws. */}
      <div className="mb-3">
        <BoardSearch onOpenCard={onSearchOpenCard} />
      </div>

      <div className="mb-2 flex gap-2">
        <FilterChip label="Pipeline" active={sectionFilter.has("pipeline")} onClick={() => toggleSection("pipeline")} />
        <FilterChip label="In Production" active={sectionFilter.has("production")} onClick={() => toggleSection("production")} />
      </div>

      <div className="mb-5 flex gap-2">
        <FilterChip label="Due this week" active={dateFilter === "week"} onClick={() => onToggleDateFilter("week")} />
        <FilterChip label="Due this month" active={dateFilter === "month"} onClick={() => onToggleDateFilter("month")} />
      </div>

      {cardsEmpty ? (
        <div className="flex flex-col items-center justify-center gap-4 py-16">
          <p className={adminType.body}>No active projects</p>
        </div>
      ) : (
        <div className="space-y-6 pb-8">
          {showPipeline &&
            PIPELINE_BUCKETS.map(bucket => (
              <div key={bucket.id}>
                <SubgroupDivider label={bucket.label} />
                {pipelineBuckets[bucket.id].length === 0 ? (
                  <p className="text-[13px] text-text-faint">— no books —</p>
                ) : (
                  <div className="space-y-3">{pipelineBuckets[bucket.id].map(renderCard)}</div>
                )}
              </div>
            ))}

          {showProduction &&
            PRODUCTION_SUBGROUPS.map(s => (
              <div key={s.id}>
                <SubgroupDivider label={s.label} />
                {productionBuckets[s.id].length === 0 ? (
                  <p className="text-[13px] text-text-faint">— no books —</p>
                ) : (
                  <div className="space-y-3">{productionBuckets[s.id].map(renderCard)}</div>
                )}
              </div>
            ))}
        </div>
      )}

      <BoardFAB onClick={onCreateProject} />
    </div>
  );
}
