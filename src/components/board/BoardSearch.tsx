"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { adminType } from "@/lib/design-tokens";

// Find any book, including the ones the board doesn't draw.
//
// The board shows active work only, so a released, recast, or archived title
// has no route back to it from here — which is how a recast book can feel like
// it simply vanished. Results open the existing edit modal by id, the same
// path /board/archive already uses to deep-link a card off the board.

export type SearchHit = {
  id: string;
  title: string;
  author: string | null;
  status: string;
  archived_at: string | null;
};

// Statuses the board itself renders. Anything else gets a badge, because
// "it's still here, it's just recast" is the answer being looked for.
const ON_BOARD = new Set(["contracted", "prepping", "recording", "editing"]);

export function BoardSearch({ onOpenCard }: { onOpenCard: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  // Debounced so typing a title doesn't fire a query per keystroke. The abort
  // controller matters more than the delay: without it a slow early request
  // can resolve after a later one and overwrite good results with stale ones.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
      setBusy(false);
      return;
    }
    const ctrl = new AbortController();
    setBusy(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/board-v2/search?q=${encodeURIComponent(term)}`, {
          signal: ctrl.signal,
        });
        const json = await res.json();
        if (res.ok) {
          setHits(json.results ?? []);
          setActive(0);
        }
      } catch {
        // Aborted by the next keystroke, or offline — either way the next
        // request settles it.
      } finally {
        if (!ctrl.signal.aborted) setBusy(false);
      }
    }, 220);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function choose(hit: SearchHit) {
    onOpenCard(hit.id);
    setOpen(false);
    setQ("");
    setHits([]);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!hits.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(i => (i + 1) % hits.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(i => (i - 1 + hits.length) % hits.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(hits[active]);
    }
  }

  const showPanel = open && q.trim().length >= 2;

  return (
    <div ref={boxRef} className="relative">
      <div className="flex items-center gap-2 rounded-full border border-surface-border bg-surface px-3 py-2 focus-within:border-accent-amber-dim">
        <Search size={14} className="shrink-0 text-text-muted" />
        <input
          value={q}
          onChange={e => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search all books…"
          className="w-44 bg-transparent text-sm text-text-primary placeholder:text-text-dim focus:outline-none"
        />
        {q && (
          <button
            type="button"
            onClick={() => {
              setQ("");
              setHits([]);
            }}
            className="shrink-0 text-text-muted hover:text-text-primary"
            aria-label="Clear search"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {showPanel && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-surface-border bg-surface-raised shadow-xl">
          {busy && hits.length === 0 && (
            <p className={`${adminType.small} px-3 py-2.5`}>Searching…</p>
          )}
          {!busy && hits.length === 0 && (
            <p className={`${adminType.small} px-3 py-2.5`}>No book matches that.</p>
          )}
          {hits.map((h, i) => {
            const offBoard = Boolean(h.archived_at) || !ON_BOARD.has(h.status);
            return (
              <button
                key={h.id}
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(h)}
                className={`flex w-full items-center justify-between gap-3 border-b border-divider px-3 py-2.5 text-left last:border-0 ${
                  i === active ? "bg-surface" : ""
                }`}
              >
                <span className="min-w-0">
                  <span className={`${adminType.bodyMd} block truncate`}>{h.title}</span>
                  <span className={`${adminType.small} block truncate`}>{h.author || "—"}</span>
                </span>
                {offBoard && (
                  <span className="shrink-0 rounded-full bg-pill-neutral-bg px-2 py-0.5 text-[11px] text-pill-neutral-text">
                    {h.archived_at ? "archived" : h.status}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
