"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { adminType } from "@/lib/design-tokens";
import { CardEditModal, type FullBoardCard } from "@/components/board/CardEditModal";

type ReleasedCard = {
  id: string;
  title: string;
  author: string | null;
  cover_url: string | null;
  released_at: string | null;
  audible_link: string | null;
  description: string | null;
  tags: string[] | null;
  trigger_warnings: string[] | null;
  is_confidential: boolean | null;
};

const SITE_TIMEZONE = "America/Los_Angeles";

function releasedLabel(iso: string | null): string {
  if (!iso) return "No release date";
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: SITE_TIMEZONE,
    month: "short",
    year: "numeric",
  });
}

/**
 * Released titles, editable.
 *
 * A book leaving the board was the end of the line for it: the board filters
 * released cards out, and this page was a placeholder, so a shipped title's
 * public description, tags, warnings and store links could only be changed in
 * the database. That includes the two whose descriptions are one-line
 * placeholders and the two linking to audible.com, where the Amazon auto-fill
 * has never been able to run.
 *
 * It reuses CardEditModal rather than growing a second editor, so a released
 * card is edited by exactly the same form as an active one — including the
 * Refetch from Amazon button, which is the reason most of these need opening.
 */
export function ReleasedClient() {
  const [cards, setCards] = useState<ReleasedCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const [authorNames, setAuthorNames] = useState<string[]>([]);
  const [coNarratorNames, setCoNarratorNames] = useState<string[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/released", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load released titles.");
      setCards(json.cards ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load released titles.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // The edit modal offers these as datalist options; a failure to fetch them
  // costs autocomplete, not the ability to edit.
  useEffect(() => {
    fetch("/api/authors").then(r => r.json())
      .then(d => setAuthorNames(((d.authors ?? []) as Array<{ name: string }>).map(a => a.name).sort()))
      .catch(() => {});
    fetch("/api/co-narrators").then(r => r.json())
      .then(d => setCoNarratorNames(((d.coNarrators ?? d.co_narrators ?? []) as Array<{ name: string }>).map(c => c.name).sort()))
      .catch(() => {});
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return cards;
    return cards.filter(c =>
      c.title.toLowerCase().includes(q) || (c.author ?? "").toLowerCase().includes(q)
    );
  }, [cards, query]);

  const handleSaved = (saved: FullBoardCard) => {
    // A card whose status was changed away from released no longer belongs
    // here, so it leaves the list rather than lingering until a reload.
    setCards(prev =>
      saved.status === "released"
        ? prev.map(c => (c.id === saved.id ? { ...c, ...saved } as ReleasedCard : c))
        : prev.filter(c => c.id !== saved.id)
    );
    setEditingId(null);
  };

  if (loading) return <p className={adminType.small}>Loading released titles…</p>;
  if (error) return <p className={`${adminType.small} text-alert-red`}>{error}</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className={adminType.titleLg}>Released</h1>
          <p className={`${adminType.small} mt-1`}>
            {cards.length} title{cards.length === 1 ? "" : "s"}. Everything here is live on the
            public site.
          </p>
        </div>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search title or author"
          className="rounded-full border border-surface-border bg-surface px-4 py-2 text-sm text-text-primary placeholder:text-text-dim focus:border-accent-amber focus:outline-none"
        />
      </div>

      {visible.length === 0 ? (
        <p className={adminType.small}>No titles match that search.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map(card => {
            // The two states worth seeing at a glance, because they are the
            // reason to open a card: copy that never got filled in, and a link
            // the Amazon fetch cannot read.
            const thinDescription = (card.description ?? "").trim().length < 200;
            const unscrapeable = !/^https?:\/\/(www\.)?amazon\.com\//i.test(card.audible_link ?? "");

            return (
              <button
                key={card.id}
                type="button"
                onClick={() => setEditingId(card.id)}
                className="flex gap-4 rounded-2xl border border-surface-border bg-surface p-4 text-left transition-colors hover:border-accent-amber/50"
              >
                {card.cover_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={card.cover_url} alt="" className="h-24 w-16 shrink-0 rounded-md object-cover" />
                ) : (
                  <div className="h-24 w-16 shrink-0 rounded-md bg-surface-raised" />
                )}

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-text-primary">{card.title}</p>
                  <p className={`${adminType.small} truncate`}>{card.author ?? "Unknown author"}</p>
                  <p className="mt-1 text-[11px] text-text-dim">{releasedLabel(card.released_at)}</p>

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {thinDescription && (
                      <span className="rounded-full bg-accent-amber/15 px-2 py-0.5 text-[10px] font-semibold text-accent-amber">
                        Short description
                      </span>
                    )}
                    {unscrapeable && (
                      <span className="rounded-full border border-surface-border px-2 py-0.5 text-[10px] text-text-muted">
                        No Amazon link
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {editingId && (
        <CardEditModal
          mode="edit"
          cardId={editingId}
          onClose={() => setEditingId(null)}
          onSaved={handleSaved}
          authorNames={authorNames}
          coNarratorNames={coNarratorNames}
          onAuthorCreated={name => setAuthorNames(prev => [...prev, name].sort())}
          onCoNarratorCreated={name => setCoNarratorNames(prev => [...prev, name].sort())}
        />
      )}
    </div>
  );
}
