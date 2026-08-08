"use client";

import { useMemo, useRef, useState } from "react";
import { DemoPlayer, DEMO_COLORS, titleToSlug } from "@/components/demos/DemoPlayer";

export type PublicDemo = {
  id: string;
  title: string;
  genre: string | null;
  description: string | null;
  file_url: string;
  duration_seconds: number | null;
};

/**
 * The full demo library, in the same cards the homepage uses.
 *
 * This page previously rendered a raw <audio controls> per demo: a white
 * browser widget on a navy page, stacked one per row, printing a duration from
 * the database directly above a second duration read from the file — which
 * disagreed with it, because the database column is stale.
 *
 * Genre filtering earns its place here in a way it does not on the homepage.
 * Twelve demos across six genres is a list someone scrolls past; an author who
 * writes romantasy wants the two that are romantasy, and the counts tell them
 * what is there before they click.
 */
export function DemosGrid({ demos }: { demos: PublicDemo[] }) {
  const [genre, setGenre] = useState<string | null>(null);
  const audioRefs = useRef<(HTMLAudioElement | null)[]>([]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const genres = useMemo(() => {
    const counts = new Map<string, number>();
    for (const d of demos) {
      if (!d.genre) continue;
      counts.set(d.genre, (counts.get(d.genre) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [demos]);

  const visible = useMemo(
    () => (genre ? demos.filter((d) => d.genre === genre) : demos),
    [demos, genre]
  );

  // Whatever is playing stops when the list changes underneath it, rather than
  // carrying on from a card that is no longer on screen.
  const changeGenre = (next: string | null) => {
    audioRefs.current.forEach((a) => { if (a) { a.pause(); a.currentTime = 0; } });
    setActiveIndex(null);
    setGenre(next);
  };

  const chip = (active: boolean) =>
    `text-xs font-semibold px-4 py-2 rounded-full border transition-colors ${
      active
        ? "bg-[#D4AF37] text-black border-[#D4AF37]"
        : "text-white/55 border-white/15 hover:border-[#D4AF37]/50 hover:text-white"
    }`;

  return (
    <>
      {genres.length > 1 && (
        <div className="mb-10 flex flex-wrap gap-2">
          <button type="button" onClick={() => changeGenre(null)} className={chip(genre === null)}>
            All <span className="opacity-60">{demos.length}</span>
          </button>
          {genres.map(([name, count]) => (
            <button key={name} type="button" onClick={() => changeGenre(name)} className={chip(genre === name)}>
              {name} <span className="opacity-60">{count}</span>
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {visible.map((demo, index) => (
          <DemoPlayer
            key={demo.id}
            title={demo.title}
            desc={demo.description ?? ""}
            src={demo.file_url}
            slug={titleToSlug(demo.title)}
            color={DEMO_COLORS[index % DEMO_COLORS.length]}
            tags={demo.genre ? [demo.genre] : []}
            durationSeconds={demo.duration_seconds ?? 0}
            index={index}
            activeIndex={activeIndex}
            setActiveIndex={setActiveIndex}
            audioRefs={audioRefs}
          />
        ))}
      </div>

      {visible.length === 0 && (
        <p className="py-16 text-center text-sm text-white/40">No demos in this genre yet.</p>
      )}
    </>
  );
}
