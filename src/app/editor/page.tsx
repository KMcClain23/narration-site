import Link from "next/link";
import Image from "next/image";
import {
  editorBoard,
  editorPickups,
  editorUploads,
  editingStateOf,
  EDITING_LABEL,
  type EditorCard,
  type UploadCount,
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
 *   Editing now        hers AND unfinished. The only section that is a queue.
 *   Finished           hers and complete. History, so it is collapsed.
 *   Unclaimed          in editing, nobody holds it. Claimable, not assigned.
 *   With someone else  held by another editor. Empty today; it will not be.
 *   Coming next        recording and prepping — soon, but not hers yet
 *   Not yet            contracted and recast, collapsed
 *
 * "Your books" USED TO BE BOTH, and that was the merge worth undoing: Underworld
 * Vows is complete and sat in the queue next to a book with chapters left. A
 * finished book is not work, and one sitting in a list of work makes the list
 * wrong about how much there is.
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

/**
 * One narrator's takes for one chapter, said plainly.
 *
 * "1 audio file" was true and useless: it did not say whose take it was, which
 * chapter it belonged to, or whether it had actually landed — all three of which
 * the query already knew, and the last of which pickup_uploads has always
 * separated via filed_at.
 *
 * FILED AND FILING ARE DIFFERENT BADGES, not one number. Filed is in the book's
 * folder and can be opened; filing is still in quarantine under a uuid name and
 * cannot be found by anybody. A combined count would tell her audio is ready
 * when it is not.
 *
 * The filed badge is a LINK to a resolving endpoint, never to a path: filed_at
 * says the file was placed there, not that it is still there.
 */
function TakeBadge({ u }: { u: UploadCount }) {
  const chapter = /^\d/.test(u.chapter.trim()) ? `ch ${u.chapter}` : u.chapter;

  if (u.filed > 0 && u.latest_filed_id) {
    /*
      MISSING IS MARKED, NOT HIDDEN.

      Dropping the badge to "0 takes" would erase the fact that a narrator
      uploaded something which has since been lost — the one thing here Dean
      would actually act on. So the take still shows, struck through and
      labelled, and it stays CLICKABLE: the resolver's page already explains
      the state better than a badge can, and it is also what re-checks and
      clears the mark if the file has been restored.
    */
    const gone = u.missing > 0;
    return (
      <a
        href={`/api/pickups/file/${u.latest_filed_id}`}
        target="_blank"
        rel="noreferrer"
        className={
          gone
            ? "rounded-full border border-rose-400/40 px-2 py-0.5 text-[11px] text-rose-300 transition-colors hover:bg-rose-400/10"
            : "rounded-full border border-emerald-400/40 px-2 py-0.5 text-[11px] text-emerald-300 transition-colors hover:bg-emerald-400/10"
        }
      >
        <span className={gone ? "line-through" : undefined}>
          {u.filed} take{u.filed === 1 ? "" : "s"} · {u.narrator_name} · {chapter}
        </span>
        {gone && <span className="ml-1 no-underline"> · missing</span>}
      </a>
    );
  }
  if (u.pending > 0) {
    // NOT A LINK. There is nothing to open — the file is in quarantine under a
    // uuid name — and a link that leads only to an explanation of why it cannot
    // lead anywhere is worse than plain text.
    return (
      <span className="rounded-full border border-white/20 px-2 py-0.5 text-[11px] text-white/50">
        {u.pending} take{u.pending === 1 ? "" : "s"} filing · {u.narrator_name} · {chapter}
      </span>
    );
  }
  return null;
}

/**
 * The full tile: a book she holds, where progress and pickups matter.
 *
 * ── THE LINK DOES NOT WRAP THE WHOLE TILE, AND IT CANNOT ───────────────────
 *
 * It used to. Then the tile grew things that are themselves interactive — the
 * take badges open a file, the folder link opens OneDrive, Unclaim posts an RPC
 * — and an anchor inside an anchor is invalid HTML that browsers resolve however
 * they like. Worse, this is a Server Component, so the `onClick` that would have
 * been needed to stop the outer link swallowing those taps cannot exist here at
 * all: passing an event handler to a DOM element from a server component throws
 * at render, which is precisely how this was found — the whole hub 500'd.
 *
 * So the Link covers the READING part of the tile and the interactive row sits
 * outside it, as a sibling.
 */
function QueueTile({
  card, openPickups, returned, takes,
}: {
  card: EditorCard; openPickups: number; returned: number; takes: UploadCount[];
}) {
  const state = editingStateOf(card.chapters_edited, card.editing_completed_at);
  const total = card.chapters_total ?? 0;
  const done = card.chapters_edited ?? 0;

  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-colors hover:border-[#D4AF37]/40">
      <Link href={`/editor/card/${card.id}`} className="flex gap-4">
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
            {openPickups > 0 && (
              <span className="rounded-full border border-rose-400/40 px-2 py-0.5 text-[11px] text-rose-300">
                {openPickups} pickup{openPickups === 1 ? "" : "s"}
              </span>
            )}
          </div>

          {/*
            HONEST PROGRESS. Only one card has chapters_total, so the others have
            no percentage to show. A bar at 0% would read as "nothing done" and a
            bar with an invented denominator would be a lie — so with no total,
            the count stands alone and the bar is absent.
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

      {/* Outside the Link. Every item here goes somewhere else of its own. */}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
        {takes.map(u => (
          <TakeBadge key={`${u.chapter}-${u.narrator_name}`} u={u} />
        ))}
        {takes.length > 0 && (
          // Resolved server-side too: pickups_folder holds a NAME, which stops
          // addressing anything the moment the folder is renamed.
          <a
            href={`/api/pickups/folder/${card.id}`}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] text-white/40 hover:text-white/70"
          >
            Open folder →
          </a>
        )}
        <span className="ml-auto">
          <ClaimButton cardId={card.id} mine />
        </span>
      </div>
    </article>
  );
}

/** The quiet tile: things she is not working. No progress, smaller. */
function QuietTile({
  card, note, claimable, mine,
}: {
  card: EditorCard; note?: string; claimable?: boolean; mine?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-2.5 transition-colors hover:border-white/25">
      <Link href={`/editor/card/${card.id}`} className="flex min-w-0 flex-1 items-center gap-3">
        <Cover url={card.cover_url} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-white/80">{card.title}</p>
          <p className="truncate text-[11px] text-white/40">
            {note ?? card.status}
            {card.deadline ? ` · ${deliveryLabel(card.deadline)}` : ""}
          </p>
        </div>
      </Link>
      {/* Siblings of the link, not children: a button inside an anchor is
          invalid, and the same nesting on QueueTile is what took the hub down. */}
      {claimable && <ClaimButton cardId={card.id} mine={false} />}
      {mine && <ClaimButton cardId={card.id} mine />}
    </div>
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

  /*
    Takes per book, KEPT AS ROWS rather than summed.

    Summing was the bug in the old badge: "1 audio file" is what is left after
    throwing away the narrator, the chapter and whether it had landed. Each row
    is one narrator's takes for one chapter and renders as its own badge.
  */
  const takesByCard = new Map<string, UploadCount[]>();
  for (const u of uploads) {
    if (u.filed === 0 && u.pending === 0) continue;
    const list = takesByCard.get(u.card_id) ?? [];
    list.push(u);
    takesByCard.set(u.card_id, list);
  }
  for (const list of takesByCard.values()) {
    // Filed first — those can be opened; still-filing rows are just news.
    list.sort((a, b) => (b.filed > 0 ? 1 : 0) - (a.filed > 0 ? 1 : 0) || a.chapter.localeCompare(b.chapter));
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
  /*
    HERS SPLITS IN TWO, on editing_completed_at.

    A claimed book with a completion date is done — it is history, and history in
    a queue overstates what is left. `editingStateOf` already draws exactly this
    line for the tile label, so this reuses the fact rather than inventing a
    second test for "finished".
  */
  const hers = inEditing.filter(c => me !== null && c.editor_id === me);
  const editingNow = hers.filter(c => !c.editing_completed_at).sort(byDelivery);
  const finished = hers
    .filter(c => c.editing_completed_at)
    .sort((a, b) => (b.editing_completed_at ?? "").localeCompare(a.editing_completed_at ?? ""));
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

      <Section title="Editing now" count={editingNow.length} hint={`${editingNow.length} in your queue`}>
        <div className="grid gap-3 sm:grid-cols-2">
          {editingNow.map(c => (
            <QueueTile
              key={c.id}
              card={c}
              openPickups={openByCard.get(c.id) ?? 0}
              returned={returnedByCard.get(c.id) ?? 0}
              takes={takesByCard.get(c.id) ?? []}
            />
          ))}
        </div>
      </Section>

      {/*
        FINISHED IS COLLAPSED, and it is still hers.

        Not dropped: she needs to see that a book she completed is accounted for,
        and to hand it back when it is genuinely done with. Not expanded either —
        it is the one section that never needs acting on, and open by default it
        would push the actual queue below the fold as it grows.
      */}
      {finished.length > 0 && (
        <details className="mb-8 rounded-xl border border-white/10 bg-white/[0.02]">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm text-white/60 hover:text-white/85">
            Finished — {finished.length} book{finished.length === 1 ? "" : "s"} you have completed
          </summary>
          <div className="grid gap-2 border-t border-white/10 p-3 sm:grid-cols-2">
            {finished.map(c => (
              <QuietTile
                key={c.id}
                card={c}
                note={
                  c.editing_completed_at
                    ? `completed ${new Date(c.editing_completed_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}`
                    : "complete"
                }
                mine
              />
            ))}
          </div>
        </details>
      )}

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
