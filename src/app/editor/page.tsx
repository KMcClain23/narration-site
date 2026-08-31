import Link from "next/link";
import Image from "next/image";
import {
  editorBoard,
  editorPickups,
  editorUploads,
  editingStateOf,
  EDITING_LABEL,
  type EditorCard,
} from "@/lib/editor-data";
import { currentSession } from "@/lib/supabase/session";
import { ClaimButton } from "./ClaimButton";

export const dynamic = "force-dynamic";

/**
 * Marizete's hub, and the question it answers is "what do I work on".
 *
 * ── WHAT WAS WRONG, BECAUSE THE FIX ONLY MAKES SENSE AGAINST IT ────────────
 *
 * It grouped by `status = editing` and called the result "Your books". Eight
 * books are in editing; she has ever worked on two. So six books she has never
 * opened were presented as her queue, several carrying red "overdue" badges
 * against deadlines that were never hers to miss.
 *
 * The schema had no answer to "whose book is this" at all, so `status` was
 * standing in for ownership and it does not mean that. `board_cards.editor_id`
 * now does, and the sections below group by it:
 *
 *   Waiting on you     returned pickups — the narrator is done, this is on her
 *   Your books         editor_id = her. The only section that is a queue.
 *   Unclaimed          in editing, nobody holds it. Claimable, not assigned.
 *   With someone else  held by another editor. Empty today; it will not be.
 *   Coming next        recording and prepping — soon, but not hers yet
 *   Not yet            contracted and recast, collapsed
 *
 * EMPTY SECTIONS RENDER NOTHING. Most days several are empty, and a heading
 * over nothing reads as something failing to load.
 */

const DAY = 24 * 60 * 60 * 1000;

/**
 * ── THE DEADLINE IS NOT HERS ───────────────────────────────────────────────
 *
 * `board_cards.deadline` is the delivery date Dean owes the publisher. It is not
 * an editing due date and there is no such column. Rendering it as a rose
 * "12d overdue" badge on her hub told her she was late on books she had never
 * been given — an alarm that was real-looking, urgent, and about somebody
 * else's commitment.
 *
 * So it is stated as a fact about the BOOK: the word "delivery", the date, and
 * "late" in muted amber once the date has passed. Not red, not bold, and never a
 * countdown addressed to her. The information stays — a book shipping in three
 * days is worth knowing while choosing what to edit — but as context rather than
 * an accusation.
 */
function deliveryLabel(deadline: string | null): string {
  if (!deadline) return "no delivery date";
  const d = new Date(`${deadline}T00:00:00`);
  const days = Math.round((d.getTime() - Date.now()) / DAY);
  const when = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (days < 0) return `delivery ${when} · late`;
  if (days === 0) return `delivery ${when} · today`;
  if (days <= 7) return `delivery ${when} · ${days}d`;
  return `delivery ${when}`;
}

function deliveryStyle(deadline: string | null): string {
  if (!deadline) return "border-white/15 text-white/40";
  const days = (new Date(`${deadline}T00:00:00`).getTime() - Date.now()) / DAY;
  // Amber, and only amber. The rose alarm is gone deliberately — see above.
  return days < 7 ? "border-amber-400/30 text-amber-200/80" : "border-white/15 text-white/50";
}

function Cover({ url, size }: { url: string | null; size: "lg" | "sm" }) {
  const box = size === "lg" ? "h-24 w-16" : "h-14 w-10";
  return (
    <div className={`relative ${box} shrink-0 overflow-hidden rounded-lg border border-white/10 bg-white/5`}>
      {url ? <Image src={url} alt="" fill sizes="64px" className="object-cover" /> : null}
    </div>
  );
}

/** The full tile: a book she holds, where progress and pickups matter. */
function QueueTile({
  card, openPickups, returned, filedAudio,
}: {
  card: EditorCard; openPickups: number; returned: number; filedAudio: number;
}) {
  const state = editingStateOf(card.chapters_edited, card.editing_completed_at);
  const total = card.chapters_total ?? 0;
  const done = card.chapters_edited ?? 0;

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
          <span className={`rounded-full border px-2 py-0.5 text-[11px] ${deliveryStyle(card.deadline)}`}>
            {deliveryLabel(card.deadline)}
          </span>
          {returned > 0 && (
            <span className="rounded-full bg-[#D4AF37] px-2 py-0.5 text-[11px] font-bold text-black">
              {returned} to check
            </span>
          )}
          {filedAudio > 0 && (
            <span className="rounded-full border border-emerald-400/40 px-2 py-0.5 text-[11px] text-emerald-300">
              {filedAudio} audio file{filedAudio === 1 ? "" : "s"}
            </span>
          )}
          {openPickups > 0 && (
            <span className="rounded-full border border-rose-400/40 px-2 py-0.5 text-[11px] text-rose-300">
              {openPickups} pickup{openPickups === 1 ? "" : "s"}
            </span>
          )}
        </div>

        {/*
          HONEST PROGRESS. Only one card has chapters_total, so the others have
          no percentage to show. A bar at 0% would read as "nothing done" and a
          bar with an invented denominator would be a lie — so with no total, the
          count stands alone and the bar is absent. The stepper fills totals in
          over time.
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

        <div className="mt-3">
          <ClaimButton cardId={card.id} mine />
        </div>
      </div>
    </Link>
  );
}

/** The quiet tile: things she is not working. No progress, smaller. */
function QuietTile({
  card, note, claimable,
}: {
  card: EditorCard; note?: string; claimable?: boolean;
}) {
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
          {card.deadline ? ` · ${deliveryLabel(card.deadline)}` : ""}
        </p>
      </div>
      {claimable && <ClaimButton cardId={card.id} mine={false} />}
    </Link>
  );
}

function Section({
  title, hint, children, count,
}: {
  title: string; hint?: string; count: number; children: React.ReactNode;
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
  const [cards, pickups, uploads, session] = await Promise.all([
    editorBoard(),
    editorPickups(),
    editorUploads(),
    currentSession(),
  ]);
  const me = session?.userId ?? null;

  // Audio waiting per book. FILED only — a pending upload is still in quarantine
  // under a uuid name, and pointing her at a folder where she cannot find it is
  // worse than saying nothing.
  const filedByCard = new Map<string, number>();
  for (const u of uploads) {
    if (u.filed > 0) filedByCard.set(u.card_id, (filedByCard.get(u.card_id) ?? 0) + u.filed);
  }

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

  /*
    WAITING ON YOU IS NOT FILTERED BY OWNERSHIP, and that is deliberate.

    A returned pickup means a narrator re-recorded something and is waiting. That
    is on whoever raised it, claimed or not — and pickups only exist where she
    has already been working. Dropping one because the book was never claimed
    would lose the most time-sensitive thing on the page to a bookkeeping detail.
  */
  const waiting = [...returnedByCard.entries()]
    .map(([id, n]) => ({ card: byId.get(id), n }))
    .filter((x): x is { card: EditorCard; n: number } => !!x.card)
    .sort((a, b) => b.n - a.n);

  const inEditing = cards.filter(c => c.status === "editing");
  const byDelivery = (a: EditorCard, b: EditorCard) =>
    (a.deadline ?? "9999-12-31").localeCompare(b.deadline ?? "9999-12-31");

  // Hers, by delivery date. Sorting on the book's date is still the right order
  // to work in: that is reading the date as information, which it is, rather
  // than as a verdict on her, which it is not.
  const mine = inEditing.filter(c => me !== null && c.editor_id === me).sort(byDelivery);
  const unclaimed = inEditing.filter(c => c.editor_id === null).sort(byDelivery);
  const others = inEditing
    .filter(c => c.editor_id !== null && c.editor_id !== me)
    .sort((a, b) => a.title.localeCompare(b.title));

  const comingNext = cards
    .filter(c => c.status === "recording" || c.status === "prepping")
    .sort(byDelivery);

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
        <h1 className="text-lg font-bold">Editing</h1>
        {released.length > 0 && (
          <Link href="/editor/released" className="text-xs text-white/40 hover:text-white/70">
            {released.length} released →
          </Link>
        )}
      </div>

      {/* The narrator has done their part; this is the one thing genuinely on her. */}
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

      <Section title="Your books" count={mine.length} hint={`${mine.length} claimed by you`}>
        <div className="grid gap-3 sm:grid-cols-2">
          {mine.map(c => (
            <QueueTile
              key={c.id}
              card={c}
              openPickups={openByCard.get(c.id) ?? 0}
              returned={returnedByCard.get(c.id) ?? 0}
              filedAudio={filedByCard.get(c.id) ?? 0}
            />
          ))}
        </div>
      </Section>

      {/*
        NOT "YOUR BOOKS TOO". These are in editing and nobody holds them; whether
        any of them is hers to pick up is a conversation with Dean, not something
        the board knows. So they are offered, with a button, and nothing here
        implies she is behind on them.
      */}
      <Section title="Unclaimed" count={unclaimed.length} hint="in editing · nobody assigned">
        <div className="grid gap-2 sm:grid-cols-2">
          {unclaimed.map(c => (
            <QuietTile key={c.id} card={c} note="unclaimed" claimable />
          ))}
        </div>
      </Section>

      <Section title="With someone else" count={others.length} hint="claimed">
        <div className="grid gap-2 sm:grid-cols-2">
          {others.map(c => (
            <QuietTile key={c.id} card={c} note={c.editor_name ? `claimed by ${c.editor_name}` : "claimed"} />
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
