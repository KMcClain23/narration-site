"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext, DragOverlay, MouseSensor, useSensor, useSensors, useDroppable,
  type DragEndEvent, type DragStartEvent, type DragOverEvent,
} from "@dnd-kit/core";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { BoardCard, type BoardV2Card, parseLocalDate, daysUntil } from "@/components/admin/BoardCard";
import { SubgroupDivider } from "@/components/admin/SubgroupDivider";
import { ReleasedDropZone, RELEASED_DROPZONE_ID } from "@/components/admin/ReleasedDropZone";
import { CardEditModal, type FullBoardCard } from "@/components/board/CardEditModal";
import { adminType } from "@/lib/design-tokens";

// Cards on this board only ever show these statuses (see ACTIVE_STATUSES in
// /api/board-v2/cards) — a save that moves a card off-status (or archives it)
// makes it vanish from view, same as "released" already does today.
const VISIBLE_STATUSES = new Set(["contracted", "prepping", "recording", "editing"]);

// ─── constants ────────────────────────────────────────────────────────────────

const PRODUCTION_SUBGROUPS = [
  { id: "prepping", label: "Prepping" },
  { id: "recording", label: "Recording" },
  { id: "editing", label: "Editing" },
] as const;

type PipelineBucket = "thisWeek" | "thisMonth" | "later";
const PIPELINE_BUCKETS: { id: PipelineBucket; label: string }[] = [
  { id: "thisWeek", label: "This Week" },
  { id: "thisMonth", label: "This Month" },
  { id: "later", label: "Later" },
];

type DateFilter = "week" | "month" | null;

const VALID_DROP_TARGETS = new Set<string>([
  "prepping", "recording", "editing", "thisWeek", "thisMonth", "later", RELEASED_DROPZONE_ID,
]);

// Dropping on any Pipeline subgroup always resets status to 'contracted' —
// the subgroup a card lands in afterward is computed from its own
// completion_date, not from which of the three zones it was dropped on.
const PIPELINE_DROP_IDS = new Set<string>(["thisWeek", "thisMonth", "later"]);

// ─── pure helpers ─────────────────────────────────────────────────────────────

function pipelineBucketFor(card: BoardV2Card): PipelineBucket {
  if (!card.deadline) return "later";
  const days = daysUntil(card.deadline);
  if (days <= 7) return "thisWeek";
  if (days <= 30) return "thisMonth";
  return "later";
}

// Ascending completion date (no-date sorts last); ties → newest created_at first.
function compareCards(a: BoardV2Card, b: BoardV2Card): number {
  const aTime = a.deadline ? parseLocalDate(a.deadline).getTime() : Infinity;
  const bTime = b.deadline ? parseLocalDate(b.deadline).getTime() : Infinity;
  if (aTime !== bTime) return aTime - bTime;
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

// "Due this week/month" chips answer "what needs MY attention" — once a book
// moves to editing, the remaining deadline is the editor's responsibility,
// not the narrator's, so editing-stage cards never match these chips (they
// still render normally in their column, just won't highlight as due-soon).
const ATTENTION_STATUSES = new Set(["contracted", "prepping", "recording"]);

function passesDateFilter(card: BoardV2Card, filter: DateFilter): boolean {
  if (!filter) return true;
  if (!card.deadline || !ATTENTION_STATUSES.has(card.status)) return false;
  const days = daysUntil(card.deadline);
  return filter === "week" ? days <= 7 : days <= 30;
}

// ─── small inline UI helpers (kept local per the approved file-count plan) ────

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors ${
        active
          ? "bg-accent-amber text-background"
          : "border border-surface-border text-text-body hover:border-accent-amber-dim"
      }`}
    >
      {label}
    </button>
  );
}

function DroppableSubgroup({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`rounded-lg transition-colors ${isOver ? "bg-surface-raised/40" : ""}`}>
      {children}
    </div>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function BoardV2Page() {
  const router = useRouter();
  const [cards, setCards] = useState<BoardV2Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [releasedCount, setReleasedCount] = useState(0);
  const [dateFilter, setDateFilter] = useState<DateFilter>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [releaseConfirm, setReleaseConfirm] = useState<BoardV2Card | null>(null);
  const [actionMenu, setActionMenu] = useState<{ card: BoardV2Card; x: number; y: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [fadingIds, setFadingIds] = useState<Set<string>>(new Set());
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editingViaDeepLink, setEditingViaDeepLink] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [authorNames, setAuthorNames] = useState<string[]>([]);
  const [coNarratorNames, setCoNarratorNames] = useState<string[]>([]);

  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 8 } }));

  // Deep-linking (?editCard=<id>): open the Edit modal directly on load —
  // used by /board/archive and other pages linking to a specific card that
  // isn't necessarily visible in this board's own filtered view (e.g. an
  // archived project). Reads window.location directly (rather than
  // next/navigation's useSearchParams) since this only needs to run once on
  // mount and a plain browser API sidesteps the Suspense-boundary
  // requirement useSearchParams would otherwise impose on this page.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("editCard");
    if (id) {
      setEditingCardId(id);
      setEditingViaDeepLink(true);
    }
  }, []);

  const closeEditModal = useCallback(() => {
    setEditingCardId(null);
    setEditingViaDeepLink(false);
    const params = new URLSearchParams(window.location.search);
    if (params.has("editCard")) {
      params.delete("editCard");
      const query = params.toString();
      router.replace(query ? `/board-v2?${query}` : "/board-v2", { scroll: false });
    }
  }, [router]);

  const handleDeepLinkNotFound = useCallback(() => {
    closeEditModal();
    setToast("That card no longer exists.");
  }, [closeEditModal]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cardsRes, countRes, authorsRes, coNarratorsRes] = await Promise.all([
        fetch("/api/board-v2/cards"),
        fetch("/api/board-v2/released-count"),
        fetch("/api/authors"),
        fetch("/api/co-narrators"),
      ]);
      const cardsData = await cardsRes.json();
      if (!cardsRes.ok) throw new Error(cardsData.error || "Failed to load board.");
      setCards(cardsData.cards || []);
      const countData = await countRes.json();
      setReleasedCount(countData.count ?? 0);
      const authorsData = await authorsRes.json();
      setAuthorNames((authorsData.authors || []).map((a: { name: string }) => a.name).sort());
      const coNarratorsData = await coNarratorsRes.json();
      setCoNarratorNames((coNarratorsData.co_narrators || []).map((n: { name: string }) => n.name).sort());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load board.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!actionMenu) return;
    const close = () => setActionMenu(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [actionMenu]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const activeCard = useMemo(() => cards.find(c => c.id === activeDragId) ?? null, [cards, activeDragId]);

  const pipelineCards = useMemo(
    () => cards.filter(c => !["prepping", "recording", "editing"].includes(c.status)),
    [cards]
  );
  const productionCards = useMemo(
    () => cards.filter(c => ["prepping", "recording", "editing"].includes(c.status)),
    [cards]
  );

  const pipelineFiltered = useMemo(() => pipelineCards.filter(c => passesDateFilter(c, dateFilter)), [pipelineCards, dateFilter]);
  const productionFiltered = useMemo(() => productionCards.filter(c => passesDateFilter(c, dateFilter)), [productionCards, dateFilter]);

  const pipelineBuckets = useMemo(() => {
    const buckets: Record<PipelineBucket, BoardV2Card[]> = { thisWeek: [], thisMonth: [], later: [] };
    for (const c of pipelineFiltered) buckets[pipelineBucketFor(c)].push(c);
    (Object.keys(buckets) as PipelineBucket[]).forEach(k => buckets[k].sort(compareCards));
    return buckets;
  }, [pipelineFiltered]);

  const productionBuckets = useMemo(() => {
    const buckets: Record<string, BoardV2Card[]> = { prepping: [], recording: [], editing: [] };
    for (const c of productionFiltered) buckets[c.status]?.push(c);
    Object.keys(buckets).forEach(k => buckets[k].sort(compareCards));
    return buckets;
  }, [productionFiltered]);

  const toggleFilter = (f: "week" | "month") => setDateFilter(prev => (prev === f ? null : f));

  const handleToggleFirst15 = useCallback(async (id: string, complete: boolean) => {
    setCards(prev => prev.map(c => (c.id === id ? { ...c, first_15_complete: complete } : c)));
    try {
      const res = await fetch("/api/board", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, first_15_complete: complete }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setCards(prev => prev.map(c => (c.id === id ? { ...c, first_15_complete: !complete } : c)));
      setError("Failed to update First 15 status — check connection.");
    }
  }, []);

  const updateStatus = useCallback(async (id: string, status: string) => {
    let previous: BoardV2Card[] = [];
    setCards(prev => { previous = prev; return prev.map(c => (c.id === id ? { ...c, status } : c)); });
    try {
      const res = await fetch("/api/board", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setCards(previous);
      setError("Failed to move project — check connection.");
    }
  }, []);

  const confirmRelease = useCallback(async () => {
    if (!releaseConfirm) return;
    const card = releaseConfirm;
    setReleaseConfirm(null);
    setFadingIds(prev => new Set(prev).add(card.id));
    try {
      const res = await fetch("/api/board", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: card.id, status: "released" }),
      });
      if (!res.ok) throw new Error();
      setTimeout(() => {
        setCards(prev => prev.filter(c => c.id !== card.id));
        setReleasedCount(n => n + 1);
        setFadingIds(prev => { const next = new Set(prev); next.delete(card.id); return next; });
      }, 300);
    } catch {
      setFadingIds(prev => { const next = new Set(prev); next.delete(card.id); return next; });
      setError("Failed to mark as released — check connection.");
    }
  }, [releaseConfirm]);

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
      setReleaseConfirm(card);
      return;
    }

    const overId = String(over.id);

    if (PIPELINE_DROP_IDS.has(overId)) {
      if (card.status !== "contracted") updateStatus(card.id, "contracted");
      return;
    }

    if (VALID_DROP_TARGETS.has(overId) && overId !== card.status) {
      updateStatus(card.id, overId);
    }
  };

  const renderCard = (c: BoardV2Card) => (
    <div key={c.id} className={`transition-opacity duration-300 ${fadingIds.has(c.id) ? "opacity-0" : "opacity-100"}`}>
      <BoardCard
        card={c}
        onToggleFirst15={handleToggleFirst15}
        onLongPress={(card, x, y) => setActionMenu({ card, x, y })}
        onOpen={card => { setEditingCardId(card.id); setEditingViaDeepLink(false); }}
      />
    </div>
  );

  // A save (or archive) can move a card off this board's visible slice —
  // same handling "released" already gets today, just generalized: if the
  // resulting row still belongs here, update it in place (or insert it, for
  // a brand-new project that isn't in `cards` yet); otherwise drop it.
  const handleCardSaved = useCallback((updated: FullBoardCard) => {
    const isVisible = !updated.archived_at && VISIBLE_STATUSES.has(updated.status);
    setCards(prev => {
      const idx = prev.findIndex(c => c.id === updated.id);
      if (!isVisible) return idx === -1 ? prev : prev.filter(c => c.id !== updated.id);
      const projected: BoardV2Card = {
        id: updated.id,
        title: updated.title,
        author: updated.author,
        co_narrator: updated.co_narrator,
        cover_url: updated.cover_url,
        status: updated.status,
        deadline: updated.deadline || null,
        first15_due: updated.first15_due || null,
        first_15_complete: updated.first_15_complete,
        word_count: updated.word_count,
        pfh_rate: updated.pfh_rate,
        payment_type: updated.payment_type,
        is_confidential: updated.is_confidential,
        narration_format: updated.narration_format,
        created_at: updated.created_at,
      };
      return idx === -1 ? [...prev, projected] : prev.map((c, i) => (i === idx ? projected : c));
    });
  }, []);

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex h-64 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent-amber border-t-transparent" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
        <div className="flex h-[calc(100vh-4rem)] flex-col">
          {/* Header row — does not scroll */}
          <div className="mb-4 flex shrink-0 items-center justify-between gap-4">
            <h1 className={adminType.titleLg}>Board</h1>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCreatingProject(true)}
                className="rounded-full bg-accent-amber px-4 py-2 text-sm font-bold text-background transition hover:brightness-110"
              >
                + New Project
              </button>
              <FilterChip label="Due this week" active={dateFilter === "week"} onClick={() => toggleFilter("week")} />
              <FilterChip label="Due this month" active={dateFilter === "month"} onClick={() => toggleFilter("month")} />
            </div>
          </div>

          {error && (
            <div className="mb-3 flex shrink-0 items-center justify-between rounded-lg border border-alert-red/30 bg-alert-red/10 px-4 py-2.5 text-sm text-alert-red">
              <span>{error}</span>
              <button onClick={() => setError(null)} className="text-alert-red/60 hover:text-alert-red">✕</button>
            </div>
          )}

          {/* Columns */}
          {cards.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4">
              <p className={adminType.body}>No active projects</p>
              <button
                onClick={() => setCreatingProject(true)}
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

      {/* Release confirmation dialog */}
      {releaseConfirm && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 px-4"
          onClick={e => { if (e.target === e.currentTarget) setReleaseConfirm(null); }}
        >
          <div className="w-full max-w-sm rounded-2xl border border-surface-border bg-surface p-6">
            <h3 className="mb-2 text-base font-bold text-text-primary">
              Mark &ldquo;{releaseConfirm.title}&rdquo; as released?
            </h3>
            <p className="mb-5 text-sm text-text-muted">
              This will publish it to Narrated Works and move it off the board.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setReleaseConfirm(null)}
                className="flex-1 rounded-full border border-surface-border py-2.5 text-sm text-text-body transition-colors hover:text-text-primary"
              >
                Cancel
              </button>
              <button
                onClick={confirmRelease}
                className="flex-1 rounded-full bg-accent-amber py-2.5 text-sm font-bold text-background transition hover:brightness-110"
              >
                Mark as Released
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile long-press action menu */}
      {actionMenu && (
        <div
          className="fixed z-[300] w-52 rounded-xl border border-surface-border bg-surface py-1.5 shadow-2xl"
          style={{ left: actionMenu.x, top: actionMenu.y }}
          onClick={e => e.stopPropagation()}
        >
          {PRODUCTION_SUBGROUPS.map(s => (
            <button
              key={s.id}
              onClick={() => { updateStatus(actionMenu.card.id, s.id); setActionMenu(null); }}
              className="block w-full px-4 py-2 text-left text-sm text-text-body transition-colors hover:bg-surface-raised hover:text-text-primary"
            >
              Move to {s.label}
            </button>
          ))}
          <button
            onClick={() => { setReleaseConfirm(actionMenu.card); setActionMenu(null); }}
            className="block w-full px-4 py-2 text-left text-sm text-text-body transition-colors hover:bg-surface-raised hover:text-text-primary"
          >
            Mark as Released
          </button>
        </div>
      )}

      {/* Card Edit modal (Stage 6.1) */}
      {editingCardId && (
        <CardEditModal
          mode="edit"
          cardId={editingCardId}
          onClose={closeEditModal}
          onSaved={handleCardSaved}
          authorNames={authorNames}
          coNarratorNames={coNarratorNames}
          onAuthorCreated={name => setAuthorNames(prev => [...prev, name].sort())}
          onCoNarratorCreated={name => setCoNarratorNames(prev => [...prev, name].sort())}
          onLoadError={editingViaDeepLink ? handleDeepLinkNotFound : undefined}
        />
      )}

      {/* New Project modal (Stage 6.4) — same CardEditModal, create mode */}
      {creatingProject && (
        <CardEditModal
          mode="create"
          onClose={() => setCreatingProject(false)}
          onSaved={handleCardSaved}
          authorNames={authorNames}
          coNarratorNames={coNarratorNames}
          onAuthorCreated={name => setAuthorNames(prev => [...prev, name].sort())}
          onCoNarratorCreated={name => setCoNarratorNames(prev => [...prev, name].sort())}
        />
      )}

      {/* Toast (e.g. "+ New Project" placeholder) */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-[400] flex items-center gap-3 rounded-xl border border-surface-border bg-surface px-4 py-3 text-xs text-text-body shadow-2xl">
          {toast}
          <button onClick={() => setToast(null)} className="text-text-faint transition-colors hover:text-text-body">✕</button>
        </div>
      )}
    </AdminLayout>
  );
}
