"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CharacterLite } from "./ParagraphText";

/**
 * Mark dialogue on the page itself, for books whose text layer cannot be read.
 *
 * A print PDF typeset with subsetted fonts draws perfectly and extracts as
 * gibberish: character names come out mangled, so nothing can be matched
 * against them and the text-based tools have nothing to work with. The page
 * image is unaffected, and it is what gets read from anyway.
 *
 * Drag across a line to mark it. Boxes are stored as fractions of the page, so
 * they land in the same place at any zoom and on any screen.
 */

export type PageHighlight = {
  id: string;
  character_id: string | null;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  note: string;
};

type Rect = { x: number; y: number; w: number; h: number };

/** Two corners in any order to a positive-area rect. */
function toRect(a: { x: number; y: number }, b: { x: number; y: number }): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  };
}

export function PageHighlighter({
  manuscriptId,
  characters,
  initialHighlights,
  pdfUrl,
}: {
  manuscriptId: string;
  characters: CharacterLite[];
  initialHighlights: PageHighlight[];
  pdfUrl: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  // Held on a ref so the render effect does not re-run when a page finishes.
  const docRef = useRef<{ numPages: number; getPage: (n: number) => Promise<unknown> } | null>(null);

  const [pageCount, setPageCount] = useState(0);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1.4);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [highlights, setHighlights] = useState<PageHighlight[]>(initialHighlights);
  const [activeCharacter, setActiveCharacter] = useState<string | null>(characters[0]?.id ?? null);
  const [drawing, setDrawing] = useState<Rect | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  const charById = new Map(characters.map(c => [c.id, c]));
  const onThisPage = highlights.filter(h => h.page === page);

  // Load the document once. pdfjs is imported here rather than at module level
  // so it never enters a server bundle.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
        // The font and CMap data ship in /public alongside the worker. Without
        // them a PDF that leans on non-embedded standard fonts, or on a
        // predefined CMap, renders blank or with the wrong glyphs — which on
        // this screen would look exactly like a broken file rather than a
        // missing asset.
        const doc = await pdfjs.getDocument({
          url: pdfUrl,
          withCredentials: true,
          standardFontDataUrl: "/pdfjs/standard_fonts/",
          cMapUrl: "/pdfjs/cmaps/",
          cMapPacked: true,
        }).promise;
        if (cancelled) return;
        docRef.current = doc as unknown as typeof docRef.current;
        setPageCount(doc.numPages);
        setLoading(false);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not open the PDF.");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfUrl]);

  // Draw the current page whenever it or the zoom changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const doc = docRef.current;
      const canvas = canvasRef.current;
      if (!doc || !canvas) return;
      try {
        const p = (await doc.getPage(page)) as {
          getViewport: (o: { scale: number }) => { width: number; height: number };
          // pdfjs 6 takes the canvas itself; canvasContext is deprecated and
          // passing it alone draws nothing at all, silently.
          render: (o: { canvas: HTMLCanvasElement; viewport: unknown }) => { promise: Promise<void> };
        };
        if (cancelled) return;
        const viewport = p.getViewport({ scale });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await p.render({ canvas, viewport }).promise;
      } catch {
        if (!cancelled) setError("Could not draw that page.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [page, scale, loading]);

  const save = useCallback(
    async (rect: Rect) => {
      try {
        const res = await fetch(`/api/admin/manuscripts/${manuscriptId}/page-highlights`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ page, character_id: activeCharacter, ...rect }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          setError(json?.error ?? "Could not save that highlight.");
          return;
        }
        setHighlights(h => [...h, json.highlight]);
      } catch {
        setError("Could not save that highlight.");
      }
    },
    [manuscriptId, page, activeCharacter],
  );

  async function remove(id: string) {
    setHighlights(h => h.filter(x => x.id !== id));
    await fetch(
      `/api/admin/manuscripts/${manuscriptId}/page-highlights?highlight_id=${encodeURIComponent(id)}`,
      { method: "DELETE" },
    ).catch(() => {});
  }

  async function reassign(id: string, characterId: string) {
    setHighlights(h => h.map(x => (x.id === id ? { ...x, character_id: characterId } : x)));
    await fetch(`/api/admin/manuscripts/${manuscriptId}/page-highlights`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ highlight_id: id, character_id: characterId }),
    }).catch(() => {});
  }

  /** Pointer position as a fraction of the page, clamped to it. */
  function point(e: React.PointerEvent): { x: number; y: number } {
    const box = surfaceRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)),
      y: Math.min(1, Math.max(0, (e.clientY - box.top) / box.height)),
    };
  }

  // Number keys pick a speaker without leaving the page. Marking dialogue is
  // hundreds of small actions, and reaching for a dropdown each time is most
  // of the work.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 9 && characters[n - 1]) setActiveCharacter(characters[n - 1].id);
      if (e.key === "ArrowRight") setPage(p => Math.min(pageCount || p, p + 1));
      if (e.key === "ArrowLeft") setPage(p => Math.max(1, p - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [characters, pageCount]);

  if (error && loading) {
    return <p className="text-sm text-alert-red">{error}</p>;
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setPage(p => Math.max(1, p - 1))}
          disabled={page <= 1}
          className="rounded-lg border border-surface-border px-2.5 py-1.5 text-[13px] text-text-body disabled:opacity-40"
        >
          Previous
        </button>
        <span className="text-[13px] text-text-muted">
          Page {page}
          {pageCount ? ` of ${pageCount}` : ""}
        </span>
        <button
          type="button"
          onClick={() => setPage(p => Math.min(pageCount || p, p + 1))}
          disabled={pageCount > 0 && page >= pageCount}
          className="rounded-lg border border-surface-border px-2.5 py-1.5 text-[13px] text-text-body disabled:opacity-40"
        >
          Next
        </button>

        <span className="ml-2 flex items-center gap-1">
          <button type="button" onClick={() => setScale(s => Math.max(0.6, s - 0.2))} className="rounded-lg border border-surface-border px-2 py-1.5 text-[13px] text-text-body">−</button>
          <span className="text-[13px] text-text-muted">{Math.round(scale * 100)}%</span>
          <button type="button" onClick={() => setScale(s => Math.min(3, s + 0.2))} className="rounded-lg border border-surface-border px-2 py-1.5 text-[13px] text-text-body">+</button>
        </span>

        <span className="ml-auto text-[13px] text-text-muted">
          {onThisPage.length} on this page · {highlights.length} in the book
        </span>
      </div>

      {/* Who the next box belongs to. Numbered so the keyboard can reach them. */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {characters.map((c, i) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setActiveCharacter(c.id)}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[13px] transition-colors ${
              activeCharacter === c.id
                ? "border-accent-amber bg-accent-amber/15 text-text-primary"
                : "border-surface-border text-text-muted hover:text-text-primary"
            }`}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.color_hex }} />
            {c.name}
            {i < 9 && <span className="text-text-faint">{i + 1}</span>}
          </button>
        ))}
        {characters.length === 0 && (
          <p className="text-[13px] text-text-muted">
            No characters yet. Add them first, then their dialogue can be marked.
          </p>
        )}
      </div>

      {error && <p className="mb-2 text-[13px] text-alert-red">{error}</p>}
      {loading && <p className="text-sm text-text-muted">Opening the PDF…</p>}

      <div
        ref={surfaceRef}
        className="relative inline-block touch-none select-none bg-white"
        onPointerDown={e => {
          if (!activeCharacter) return;
          dragStart.current = point(e);
          setDrawing(null);
        }}
        onPointerMove={e => {
          if (!dragStart.current) return;
          setDrawing(toRect(dragStart.current, point(e)));
        }}
        onPointerUp={e => {
          const start = dragStart.current;
          dragStart.current = null;
          if (!start || !activeCharacter) return;
          const rect = toRect(start, point(e));
          setDrawing(null);
          if (rect.w > 0.005 && rect.h > 0.002) void save(rect);
        }}
      >
        <canvas ref={canvasRef} className="block" />

        {onThisPage.map(h => {
          const c = h.character_id ? charById.get(h.character_id) : undefined;
          return (
            <span
              key={h.id}
              title={`${c?.name ?? "Unassigned"} — click to remove`}
              onPointerDown={e => e.stopPropagation()}
              onClick={() => void remove(h.id)}
              onContextMenu={e => {
                // Right-click reassigns to whoever is currently selected,
                // which is faster than deleting and drawing it again.
                e.preventDefault();
                if (activeCharacter) void reassign(h.id, activeCharacter);
              }}
              className="absolute cursor-pointer rounded-[2px] mix-blend-multiply"
              style={{
                left: `${h.x * 100}%`,
                top: `${h.y * 100}%`,
                width: `${h.w * 100}%`,
                height: `${h.h * 100}%`,
                background: `${c?.color_hex ?? "#888888"}66`,
                border: `1px solid ${c?.color_hex ?? "#888888"}`,
              }}
            />
          );
        })}

        {drawing && (
          <span
            className="pointer-events-none absolute rounded-[2px] border border-dashed border-black/60 bg-black/10"
            style={{
              left: `${drawing.x * 100}%`,
              top: `${drawing.y * 100}%`,
              width: `${drawing.w * 100}%`,
              height: `${drawing.h * 100}%`,
            }}
          />
        )}
      </div>

      <p className="mt-3 text-[13px] text-text-muted">
        Drag across a line to mark it for the selected speaker. Number keys switch speaker, arrow
        keys turn the page. Click a highlight to remove it, right-click to reassign it.
      </p>
    </div>
  );
}
