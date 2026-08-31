import Link from "next/link";
import Image from "next/image";
import {
  editorBoard,
  editorPickups,
  editingStateOf,
  EDITING_LABEL,
  type EditorCard,
} from "@/lib/editor-data";

export const dynamic = "force-dynamic";

/**
 * Marizete's board.
 *
 * Read with HER session through `board_for_editor`. Every card on it, and not
 * one financial column — the function does not select them, so there is nothing
 * on this page filtering anything out. See editor-data.ts.
 */

const STATE_STYLE: Record<string, string> = {
  not_started: "border-white/15 text-white/50",
  in_progress: "border-[#D4AF37]/50 text-[#D4AF37]",
  done: "border-emerald-400/40 text-emerald-300",
};

function CardTile({ card, openPickups }: { card: EditorCard; openPickups: number }) {
  const state = editingStateOf(card.chapters_edited, card.editing_completed_at);
  const total = card.chapters_total ?? 0;
  const done = card.chapters_edited ?? 0;
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;

  return (
    <Link
      href={`/editor/card/${card.id}`}
      className="group flex gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-colors hover:border-[#D4AF37]/40 hover:bg-white/[0.06]"
    >
      <div className="relative h-24 w-16 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-white/5">
        {card.cover_url ? (
          <Image src={card.cover_url} alt="" fill sizes="64px" className="object-cover" />
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">{card.title}</p>
        <p className="truncate text-xs text-white/50">{card.author ?? "—"}</p>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-2 py-0.5 text-[11px] ${STATE_STYLE[state]}`}>
            {EDITING_LABEL[state]}
          </span>
          {total > 0 && (
            <span className="text-[11px] text-white/40">
              {done} of {total} chapters
            </span>
          )}
          {openPickups > 0 && (
            <span className="rounded-full border border-rose-400/40 px-2 py-0.5 text-[11px] text-rose-300">
              {openPickups} pickup{openPickups === 1 ? "" : "s"}
            </span>
          )}
        </div>

        {total > 0 && (
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-[#D4AF37]" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
    </Link>
  );
}

export default async function EditorBoardPage() {
  const [cards, pickups] = await Promise.all([editorBoard(), editorPickups()]);

  // Open = raised and not yet resolved or dismissed. Counted here so a card
  // shows the badge without the tile needing its own query.
  const openByCard = new Map<string, number>();
  for (const p of pickups) {
    if (p.status === "resolved" || p.status === "dismissed") continue;
    openByCard.set(p.card_id, (openByCard.get(p.card_id) ?? 0) + 1);
  }

  return (
    <>
      <div className="mb-5 flex items-baseline justify-between">
        <h1 className="text-lg font-bold">Books</h1>
        <p className="text-xs text-white/40">
          {cards.length} book{cards.length === 1 ? "" : "s"}
        </p>
      </div>

      {cards.length === 0 ? (
        <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-sm text-white/50">
          No books yet.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {cards.map(c => (
            <CardTile key={c.id} card={c} openPickups={openByCard.get(c.id) ?? 0} />
          ))}
        </div>
      )}
    </>
  );
}
