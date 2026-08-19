"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AdminLayout } from "@/components/admin/AdminLayout";
import type { BoardV2Card } from "@/components/admin/board-card-utils";
import { CardEditModal, type FullBoardCard } from "@/components/board/CardEditModal";
import { ArchiveConfirmDialog } from "@/components/board/ArchiveConfirmDialog";
import { BoardActionMenu } from "@/components/board/BoardActionMenu";
import { DesktopBoardColumns } from "@/components/board/desktop/DesktopBoardColumns";
import { MobileBoardList } from "@/components/board/mobile/MobileBoardList";
import { useModalOpen } from "@/components/admin/AdminModalContext";
import { useIsDesktop } from "@/components/admin/useIsDesktop";
import {
  bucketPipeline, bucketProduction, passesDateFilter, type DateFilter,
} from "@/components/board/board-filters";

// Cards on this board only ever show these statuses (see ACTIVE_STATUSES in
// /api/board-v2/cards) — a save that moves a card off-status (or archives it)
// makes it vanish from view, same as "released" already does today.
const VISIBLE_STATUSES = new Set(["contracted", "prepping", "recording", "editing"]);

export default function BoardV2Page() {
  const router = useRouter();
  const isDesktop = useIsDesktop();
  const [cards, setCards] = useState<BoardV2Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [releasedCount, setReleasedCount] = useState(0);
  const [dateFilter, setDateFilter] = useState<DateFilter>(null);
  const [releaseConfirm, setReleaseConfirm] = useState<BoardV2Card | null>(null);
  useModalOpen(!!releaseConfirm);
  const [archiveTarget, setArchiveTarget] = useState<BoardV2Card | null>(null);
  useModalOpen(!!archiveTarget);
  const [actionMenu, setActionMenu] = useState<{ card: BoardV2Card; x: number; y: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [fadingIds, setFadingIds] = useState<Set<string>>(new Set());
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editingViaDeepLink, setEditingViaDeepLink] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [authorNames, setAuthorNames] = useState<string[]>([]);
  const [coNarratorNames, setCoNarratorNames] = useState<string[]>([]);

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
      router.replace(query ? `/board?${query}` : "/board", { scroll: false });
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

  const pipelineBuckets = useMemo(() => bucketPipeline(pipelineFiltered), [pipelineFiltered]);
  const productionBuckets = useMemo(() => bucketProduction(productionFiltered), [productionFiltered]);

  const toggleDateFilter = (f: "week" | "month") => setDateFilter(prev => (prev === f ? null : f));

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

  // A save (or archive, or the swipe/action-menu archive path below) can move
  // a card off this board's visible slice — same handling "released" already
  // gets, just generalized: if the resulting row still belongs here, update
  // it in place (or insert it, for a brand-new project not yet in `cards`);
  // otherwise drop it.
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
        narrator_share_percent: updated.narrator_share_percent,
        // Carried through so a card's booth load updates the moment the
        // calendar is saved, without waiting for a board refetch.
        recording_dates: updated.recording_dates,
        words_recorded: updated.words_recorded,
        created_at: updated.created_at,
      };
      return idx === -1 ? [...prev, projected] : prev.map((c, i) => (i === idx ? projected : c));
    });
  }, []);

  const handleOpenCard = useCallback((card: BoardV2Card) => {
    setEditingCardId(card.id);
    setEditingViaDeepLink(false);
  }, []);

  // Search hands back an id, not a board card — the whole point is that the
  // result may be a book this board never loaded. CardEditModal fetches by id,
  // so a released, recast or archived title opens the same as any other.
  const handleOpenCardById = useCallback((id: string) => {
    setEditingCardId(id);
    setEditingViaDeepLink(false);
  }, []);

  const handleLongPress = useCallback((card: BoardV2Card, x: number, y: number) => {
    setActionMenu({ card, x, y });
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

  const cardsEmpty = cards.length === 0;

  return (
    <AdminLayout>
      {error && (
        <div className="mb-3 flex shrink-0 items-center justify-between rounded-lg border border-alert-red/30 bg-alert-red/10 px-4 py-2.5 text-sm text-alert-red">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-alert-red/60 hover:text-alert-red">✕</button>
        </div>
      )}

      {isDesktop ? (
        <DesktopBoardColumns
          cardsEmpty={cardsEmpty}
          cards={cards}
          pipelineCards={pipelineCards}
          productionCards={productionCards}
          pipelineFiltered={pipelineFiltered}
          productionFiltered={productionFiltered}
          pipelineBuckets={pipelineBuckets}
          productionBuckets={productionBuckets}
          releasedCount={releasedCount}
          dateFilter={dateFilter}
          onToggleDateFilter={toggleDateFilter}
          fadingIds={fadingIds}
          onToggleFirst15={handleToggleFirst15}
          onLongPress={handleLongPress}
          onOpenCard={handleOpenCard}
          onSearchOpenCard={handleOpenCardById}
          onCreateProject={() => setCreatingProject(true)}
          onUpdateStatus={updateStatus}
          onRequestRelease={card => setReleaseConfirm(card)}
        />
      ) : (
        <MobileBoardList
          cardsEmpty={cardsEmpty}
          pipelineBuckets={pipelineBuckets}
          productionBuckets={productionBuckets}
          releasedCount={releasedCount}
          dateFilter={dateFilter}
          onToggleDateFilter={toggleDateFilter}
          fadingIds={fadingIds}
          onToggleFirst15={handleToggleFirst15}
          onLongPress={handleLongPress}
          onOpenCard={handleOpenCard}
          onSearchOpenCard={handleOpenCardById}
          onSwipeArchive={card => setArchiveTarget(card)}
          onCreateProject={() => setCreatingProject(true)}
        />
      )}

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

      {/* Archive confirmation — reached via swipe (mobile) or the long-press
          action menu (either platform) */}
      {archiveTarget && (
        <ArchiveConfirmDialog
          card={{ id: archiveTarget.id, title: archiveTarget.title }}
          onArchived={() => {
            setCards(prev => prev.filter(c => c.id !== archiveTarget.id));
            setArchiveTarget(null);
          }}
          onCancel={() => setArchiveTarget(null)}
        />
      )}

      {/* Long-press action menu */}
      {actionMenu && (
        <BoardActionMenu
          x={actionMenu.x}
          y={actionMenu.y}
          onMoveToStage={status => { updateStatus(actionMenu.card.id, status); setActionMenu(null); }}
          onMoveToPipeline={() => { updateStatus(actionMenu.card.id, "contracted"); setActionMenu(null); }}
          onMarkReleased={() => { setReleaseConfirm(actionMenu.card); setActionMenu(null); }}
          onArchive={() => { setArchiveTarget(actionMenu.card); setActionMenu(null); }}
        />
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

      {/* Toast (e.g. deep-link-not-found) */}
      {toast && (
        <div className="fixed bottom-24 right-5 z-[400] flex items-center gap-3 rounded-xl border border-surface-border bg-surface px-4 py-3 text-xs text-text-body shadow-2xl md:bottom-5">
          {toast}
          <button onClick={() => setToast(null)} className="text-text-faint transition-colors hover:text-text-body">✕</button>
        </div>
      )}
    </AdminLayout>
  );
}
