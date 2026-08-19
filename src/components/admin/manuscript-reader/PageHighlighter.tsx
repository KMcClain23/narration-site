"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CharacterLite } from "./ParagraphText";
import { uploadVoiceSample } from "./ManuscriptReader";

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
  /**
   * "highlight" is a box over dialogue. "voice" is a character dropped into
   * the margin, there to be clicked and heard while reading past.
   */
  kind?: "highlight" | "voice";
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

  // Held locally so a character added here, or a sample attached, appears at
  // once rather than after a reload.
  const [cast, setCast] = useState<CharacterLite[]>(characters);
  const [newName, setNewName] = useState("");
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const charById = new Map(cast.map(c => [c.id, c]));
  const here = highlights.filter(h => h.page === page);
  const onThisPage = here.filter(h => h.kind !== "voice");
  const pinsHere = here.filter(h => h.kind === "voice");

  /** A voice pin: a character parked on the page, not a box over dialogue. */
  async function dropPin(characterId: string, at: { x: number; y: number }) {
    try {
      const res = await fetch(`/api/admin/manuscripts/${manuscriptId}/page-highlights`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          page,
          character_id: characterId,
          kind: "voice",
          x: at.x,
          y: at.y,
          w: 0,
          h: 0,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.error ?? "Could not place that voice.");
        return;
      }
      setHighlights(h => [...h, json.highlight]);
    } catch {
      setError("Could not place that voice.");
    }
  }

  /** One element reused for every sample, so two cannot play at once. */
  function toggleSample(characterId: string, url: string) {
    const audio = (audioRef.current ??= new Audio());
    if (playing === characterId) {
      audio.pause();
      setPlaying(null);
      return;
    }
    audio.pause();
    audio.src = url;
    audio.currentTime = 0;
    audio.onended = () => setPlaying(null);
    void audio.play().catch(() => {});
    setPlaying(characterId);
  }

  async function addCharacter() {
    const name = newName.trim();
    if (!name) return;
    setError(null);
    try {
      const res = await fetch(`/api/admin/manuscripts/${manuscriptId}/characters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.error ?? "Could not add that character.");
        return;
      }
      setCast(c => [...c, json.character]);
      setNewName("");
      // Newly added is almost always who you are about to mark.
      setActiveCharacter(json.character.id);
    } catch {
      setError("Could not add that character.");
    }
  }

  async function attachSample(characterId: string, file: File) {
    setUploadingFor(characterId);
    setError(null);
    try {
      const url = await uploadVoiceSample(manuscriptId, characterId, file, () => {});
      setCast(c => c.map(x => (x.id === characterId ? { ...x, voice_sample_url: url } : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not attach that sample.");
    } finally {
      setUploadingFor(null);
    }
  }

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

  /**
   * The wheel turns pages rather than scrolling past the book.
   *
   * A page at a time is how this is read, and a wheel that scrolls the
   * surrounding page instead means reaching for a button after every one.
   * Attached natively rather than through React so it can be non-passive and
   * actually prevent the scroll it is replacing.
   *
   * Accumulated and rate-limited because one flick of a trackpad emits dozens
   * of small deltas, which would otherwise skip half a chapter.
   */
  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;
    let travelled = 0;
    let lastTurn = 0;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      travelled += e.deltaY;

      const now = Date.now();
      if (now - lastTurn < 150 || Math.abs(travelled) < 40) return;

      const direction = travelled > 0 ? 1 : -1;
      travelled = 0;
      lastTurn = now;
      setPage(p => Math.min(Math.max(1, p + direction), pageCount || p));
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [pageCount]);

  // Number keys pick a speaker without leaving the page. Marking dialogue is
  // hundreds of small actions, and reaching for a dropdown each time is most
  // of the work.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 9 && cast[n - 1]) setActiveCharacter(cast[n - 1].id);
      if (e.key === "ArrowRight") setPage(p => Math.min(pageCount || p, p + 1));
      if (e.key === "ArrowLeft") setPage(p => Math.max(1, p - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cast, pageCount]);

  if (error && loading) {
    return <p className="text-sm text-[#a3352b]">{error}</p>;
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setPage(p => Math.max(1, p - 1))}
          disabled={page <= 1}
          className="rounded-lg border border-[#ddd8c9] px-2.5 py-1.5 text-[13px] text-[#26241f] disabled:opacity-40"
        >
          Previous
        </button>
        <span className="text-[13px] text-[#6f6a5e]">
          Page {page}
          {pageCount ? ` of ${pageCount}` : ""}
        </span>
        <button
          type="button"
          onClick={() => setPage(p => Math.min(pageCount || p, p + 1))}
          disabled={pageCount > 0 && page >= pageCount}
          className="rounded-lg border border-[#ddd8c9] px-2.5 py-1.5 text-[13px] text-[#26241f] disabled:opacity-40"
        >
          Next
        </button>

        <span className="ml-2 flex items-center gap-1">
          <button type="button" onClick={() => setScale(s => Math.max(0.6, s - 0.2))} className="rounded-lg border border-[#ddd8c9] px-2 py-1.5 text-[13px] text-[#26241f]">−</button>
          <span className="text-[13px] text-[#6f6a5e]">{Math.round(scale * 100)}%</span>
          <button type="button" onClick={() => setScale(s => Math.min(3, s + 0.2))} className="rounded-lg border border-[#ddd8c9] px-2 py-1.5 text-[13px] text-[#26241f]">+</button>
        </span>

        <span className="ml-auto text-[13px] text-[#6f6a5e]">
          {onThisPage.length} marked here · {pinsHere.length} voice{pinsHere.length === 1 ? "" : "s"} ·{" "}
          {highlights.filter(h => h.kind !== "voice").length} in the book
        </span>
      </div>

      {/* Who the next box belongs to. Numbered so the keyboard can reach them. */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {cast.map((c, i) => (
          <span
            key={c.id}
            draggable={Boolean(c.voice_sample_url)}
            onDragStart={e => {
              // Only a character with a sample is worth parking on a page:
              // a pin with nothing to play is a dot that does nothing.
              if (!c.voice_sample_url) return;
              e.dataTransfer.setData("text/dmn-character", c.id);
              e.dataTransfer.effectAllowed = "copy";
            }}
            title={c.voice_sample_url ? "Drag onto the page to leave a voice you can click" : undefined}
            className={`flex items-center gap-1.5 rounded-lg border px-1.5 py-1 text-[13px] transition-colors ${
              activeCharacter === c.id
                ? "border-[#8a6d2f] bg-[#8a6d2f]/15 font-medium text-[#1a1a1a]"
                : "border-black/15 text-[#1a1a1a]/60"
            }`}
          >
            {/* The swatch doubles as the play button, which is how the text
                view already works: hearing the voice you are about to assign
                is the point of having samples at all. */}
            <button
              type="button"
              onClick={() => c.voice_sample_url && toggleSample(c.id, c.voice_sample_url)}
              disabled={!c.voice_sample_url}
              title={c.voice_sample_url ? `Play ${c.name}` : `${c.name} has no voice sample yet`}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full disabled:cursor-default"
              style={{ background: c.color_hex }}
            >
              {c.voice_sample_url && (
                <span className="text-[9px] leading-none text-white">
                  {playing === c.id ? "■" : "▶"}
                </span>
              )}
            </button>

            <button type="button" onClick={() => setActiveCharacter(c.id)} className="hover:text-[#1a1a1a]">
              {c.name}
            </button>
            {i < 9 && <span className="text-[#8a8577]">{i + 1}</span>}

            <label
              title={c.voice_sample_url ? "Replace the voice sample" : "Add a voice sample"}
              className="cursor-pointer px-0.5 text-[11px] text-[#8a8577] hover:text-[#1a1a1a]"
            >
              {uploadingFor === c.id ? "…" : "♪"}
              <input
                type="file"
                accept="audio/*"
                className="sr-only"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) void attachSample(c.id, f);
                  e.target.value = "";
                }}
              />
            </label>
          </span>
        ))}

        {/* A book marked up on the page was never parsed, so it has no cast at
            all. Without this there is nobody to assign dialogue to and the
            view is useless for exactly the books it exists for. */}
        <form
          onSubmit={e => {
            e.preventDefault();
            void addCharacter();
          }}
          className="flex items-center gap-1"
        >
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Add character"
            className="w-32 rounded-lg border border-black/15 bg-white/60 px-2 py-1 text-[13px] text-[#1a1a1a] placeholder:text-[#8a8577] focus:border-[#8a6d2f] focus:outline-none"
          />
          <button
            type="submit"
            disabled={!newName.trim()}
            className="rounded-lg border border-black/15 px-2 py-1 text-[13px] text-[#6f6a5e] hover:text-[#1a1a1a] disabled:opacity-40"
          >
            Add
          </button>
        </form>
      </div>

      {error && <p className="mb-2 text-[13px] text-[#a3352b]">{error}</p>}
      {loading && <p className="text-sm text-[#6f6a5e]">Opening the PDF…</p>}

      {/* The canvas is drawn at full page resolution and scaled down by CSS to
          fit, rather than rendered small: the text stays sharp, and the
          highlight overlay is positioned in percentages so it tracks whatever
          size the page ends up. Overflowing the reading card was the previous
          behavior, with the right-hand margin of every page cut off. */}
      <div
        ref={surfaceRef}
        onDragOver={e => {
          if (e.dataTransfer.types.includes("text/dmn-character")) e.preventDefault();
        }}
        onDrop={e => {
          const id = e.dataTransfer.getData("text/dmn-character");
          if (!id) return;
          e.preventDefault();
          const box = surfaceRef.current!.getBoundingClientRect();
          void dropPin(id, {
            x: Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)),
            y: Math.min(1, Math.max(0, (e.clientY - box.top) / box.height)),
          });
        }}
        className="relative inline-block max-w-full touch-none select-none bg-white"
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
        <canvas ref={canvasRef} className="block h-auto max-w-full" />

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

        {/* Parked voices. Click to hear, right-click to take away. Sat on top
            of the highlights so a pin dropped over marked dialogue is still
            reachable. */}
        {pinsHere.map(p => {
          const c = p.character_id ? charById.get(p.character_id) : undefined;
          if (!c) return null;
          return (
            <button
              key={p.id}
              type="button"
              onPointerDown={e => e.stopPropagation()}
              onClick={() => c.voice_sample_url && toggleSample(c.id, c.voice_sample_url)}
              onContextMenu={e => {
                e.preventDefault();
                void remove(p.id);
              }}
              title={`${c.name} — click to hear, right-click to remove`}
              className="absolute z-10 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white shadow-md"
              style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, background: c.color_hex }}
            >
              <span className="text-[11px] leading-none text-white">
                {playing === c.id ? "■" : "▶"}
              </span>
            </button>
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

      <p className="mt-3 text-[13px] text-[#6f6a5e]">
        Drag across a line to mark it for the selected speaker. Number keys switch speaker, arrow
        keys and the scroll wheel turn the page. Click a highlight to remove it, right-click to reassign
        it. Drag a
        character with a voice sample onto the page to leave a pin you can click to hear them.
      </p>
    </div>
  );
}
