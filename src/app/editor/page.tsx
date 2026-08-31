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
 * Marizete's hub, and the question it answers is "what do I work on".
 *
 * It used to render all 33 cards in one flat grid. Twelve were released and nine
 * more contracted-but-unrecorded, so two thirds of the page was work she cannot
 * touch and the eight she is actually editing were scattered among them. The
 * page is now ordered by what she can act on:
 *
 *   Waiting on you   returned pickups — overdue BY DEFINITION, the narrator is done
 *   Editing now      status = editing, by deadline. Her real queue.
 *   Coming next      recording and prepping. Soon, but not hers yet.
 *   Not yet          contracted and recast, collapsed.
 *   Released         gone to its own page; a third of the list and none of it work.
 *
 * EMPTY SECTIONS RENDER NOTHING. Several are empty on an ordinary day, and a
 * heading over nothing reads as something failing to load.
 */

const DAY = 24 * 60 * 60 * 1000;

function dueState(deadline: string | null): "overdue" | "soon" | "later" | "none" {
  if (!deadline) return "none";
  const days = (new Date(`${deadline}T00:00:00`).getTime() - Date.now()) / DAY;
  if (days < 0) return "overdue";
  if (days <= 7) return "soon";
  return "later";
}

const DUE_STYLE: Record<string, string> = {
  overdue: "border-rose-400/50 bg-rose-500/15 text-rose-200",
  soon: "border-[#D4AF37]/50 bg-[#D4AF37]/15 text-[#E0C15A]",
  later: "border-white/15 text-white/50",
  none: "border-white/15 text-white/40",
};

function dueLabel(deadline: string | null): string {
  if (!deadline) return "no deadline";
  const d = new Date(`${deadline}T00:00:00`);
  const days = Math.round((d.getTime() - Date.now()) / DAY);
  const when = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (days < 0) return `${when} · ${Math.abs(days)}d overdue`;
  if (days === 0) return `${when} · today`;
  if (days <= 7) return `${when} · ${days}d`;
  return when;
}

function Cover({ url, size }: { url: string | null; size: "lg" | "sm" }) {
  const box = size === "lg" ? "h-24 w-16" : "h-14 w-10";
  return (
    <div className={`relative ${box} shrink-0 overflow-hidden rounded-lg border border-white/10 bg-white/5`}>
      {url ? <Image src={url} alt="" fill sizes="64px" className="object-cover" /> : null}
    </div>
  );
}

/** The full tile: her queue, where progress and pickups matter. */
function QueueTile({ card, openPickups, returned }: { card: EditorCard; openPickups: number; returned: number }) {
  const state = editingStateOf(card.chapters_edited, card.editing_completed_at);
  const total = card.chapters_total ?? 0;
  const done = card.chapters_edited ?? 0;
  const due = dueState(card.deadline);

  return (
    <Link
      href={`/editor/card/${card.id}`}
      className="group flex gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-colors hover:border-[#D4AF37]/40 hover:bg-white/[0.06]"
    >
      <Cover url={card.cover_url} size="lg" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">{card.title}</p>
        <p className="truncate text-xs text-white/50">{card.author ?? "—"}</p>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-2 py-0.5 text-[11px] ${DUE_STYLE[due]}`}>
            {dueLabel(card.deadline)}
          </span>
          {returned > 0 && (
            <span className="rounded-full bg-[#D4AF37] px-2 py-0.5 text-[11px] font-bold text-black">
              {returned} to check
            </span>
          )}
          {openPickups > 0 && (
            <span className="rounded-full border border-rose-400/40 px-2 py-0.5 text-[11px] text-rose-300">
              {openPickups} pickup{openPickups === 1 ? "" : "s"}
            </span>
          )}
        </div>

        {/*
          HONEST PROGRESS. Only one card has chapters_total, so seven of the
          eight editing tiles have no percentage to show. A bar at 0% would read
          as "nothing done" and a bar with an invented denominator would be a
          lie — so with no total, the count stands alone and the bar is absent.
          Part B's stepper fills the totals in over time.
        */}
        <div className="mt-2 flex items-center gap-2 text-[11px] text-white/40">
          <span>{EDITING_LABEL[state]}</span>
          {total > 0 ? (
            <span>· {done} of {total} chapters</span>
          ) : done > 0 ? (
            <span>· {done} chapter{done === 1 ? "" : "s"} edited</span>
          ) : null}
        </div>
        {total > 0 && (
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-[#D4AF37]"
              style={{ width: `${Math.min(100, Math.round((done / total) * 100))}%` }}
            />
          </div>
        )}
      </div>
    </Link>
  );
}

/** The quiet tile: things she cannot start. No progress, smaller. */
function QuietTile({ card, note }: { card: EditorCard; note?: string }) {
  return (
    <Link
      href={`/editor/card/${card.id}`}
      className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-2.5 transition-colors hover:border-white/25"
    >
      <Cover url={card.cover_url} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-white/80">{card.title}</p>
        <p className="truncate text-[11px] text-white/40">
          {note ?? card.status}
          {card.deadline ? ` · ${dueLabel(card.deadline)}` : ""}
        </p>
      </div>
    </Link>
  );
}

function Section({
  title,
  hint,
  children,
  count,
}: {
  title: string;
  hint?: string;
  count: number;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <section className="mb-8">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-white/10 pb-2">
        <h2 className="text-base font-bold text-white">{title}</h2>
        <span className="text-xs text-white/40">{hint ?? `${count}`}</span>
      </div>
      {children}
    </section>
  );
}

export default async function EditorBoardPage() {
  const [cards, pickups] = await Promise.all([editorBoard(), editorPickups()]);

  const openByCard = new Map<string, number>();
  const returnedByCard = new Map<string, number>();
  for (const p of pickups) {
    if (p.status === "resolved" || p.status === "dismissed") continue;
    openByCard.set(p.card_id, (openByCard.get(p.card_id) ?? 0) + 1);
    if (p.status === "returned") {
      returnedByCard.set(p.card_id, (returnedByCard.get(p.card_id) ?? 0) + 1);
    }
  }

  const byId = new Map(cards.map(c => [c.id, c]));
  const waiting = [...returnedByCard.entries()]
    .map(([id, n]) => ({ card: byId.get(id), n }))
    .filter((x): x is { card: EditorCard; n: number } => !!x.card)
    .sort((a, b) => b.n - a.n);

  // Her queue, by deadline. All eight have one, so this is the real answer to
  // "what's next" rather than an ordering invented here. Nulls sort last so a
  // card without a deadline never displaces one with a date.
  const editing = cards
    .filter(c => c.status === "editing")
    .sort((a, b) => (a.deadline ?? "9999-12-31").localeCompare(b.deadline ?? "9999-12-31"));

  const comingNext = cards
    .filter(c => c.status === "recording" || c.status === "prepping")
    .sort((a, b) => (a.deadline ?? "9999-12-31").localeCompare(b.deadline ?? "9999-12-31"));

  /*
    RECAST LIVES HERE, and it is labelled rather than absorbed.

    It is neither upcoming nor finished: the book is being re-recorded by
    somebody else and may or may not come back to her. It cannot go in "Coming
    next", which promises work arriving soon, and it must not be dropped, which
    would hide a book entirely. So it sits in the collapsed section with every
    other thing she cannot act on — with its status on the tile, so it is never
    silently filed as "contracted".
  */
  const notYet = cards
    .filter(c => c.status === "contracted" || c.status === "recast")
    .sort((a, b) => a.title.localeCompare(b.title));

  const released = cards.filter(c => c.status === "released");
  const waitingTotal = waiting.reduce((n, w) => n + w.n, 0);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-lg font-bold">Your books</h1>
        {released.length > 0 && (
          <Link href="/editor/released" className="text-xs text-white/40 hover:text-white/70">
            {released.length} released →
          </Link>
        )}
      </div>

      {/* Overdue by definition: the narrator has done their part. */}
      <Section
        title="Waiting on you"
        count={waiting.length}
        hint={`${waitingTotal} re-recorded pickup${waitingTotal === 1 ? "" : "s"}`}
      >
        <div className="space-y-2">
          {waiting.map(({ card, n }) => (
            <Link
              key={card.id}
              href={`/editor/card/${card.id}`}
              className="flex items-center gap-3 rounded-xl border border-[#D4AF37]/50 bg-[#D4AF37]/[0.08] p-3 transition-colors hover:bg-[#D4AF37]/[0.14]"
            >
              <Cover url={card.cover_url} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">{card.title}</p>
                <p className="text-[11px] text-[#E0C15A]">
                  {n} re-recorded pickup{n === 1 ? "" : "s"} to check
                </p>
              </div>
            </Link>
          ))}
        </div>
      </Section>

      <Section title="Editing now" count={editing.length} hint={`${editing.length} in your queue`}>
        <div className="grid gap-3 sm:grid-cols-2">
          {editing.map(c => (
            <QueueTile
              key={c.id}
              card={c}
              openPickups={openByCard.get(c.id) ?? 0}
              returned={returnedByCard.get(c.id) ?? 0}
            />
          ))}
        </div>
      </Section>

      <Section title="Coming next" count={comingNext.length} hint="recording or prepping">
        <div className="grid gap-2 sm:grid-cols-2">
          {comingNext.map(c => (
            <QuietTile key={c.id} card={c} />
          ))}
        </div>
      </Section>

      {notYet.length > 0 && (
        <details className="mb-8 rounded-xl border border-white/10 bg-white/[0.02]">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm text-white/60 hover:text-white/85">
            Not yet — {notYet.length} book{notYet.length === 1 ? "" : "s"} not recorded
          </summary>
          <div className="grid gap-2 border-t border-white/10 p-3 sm:grid-cols-2">
            {notYet.map(c => (
              <QuietTile key={c.id} card={c} note={c.status === "recast" ? "recast" : "contracted"} />
            ))}
          </div>
        </details>
      )}

      {cards.length === 0 && (
        <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-sm text-white/50">
          No books yet.
        </p>
      )}
    </>
  );
}
