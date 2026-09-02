"use client";

import { useState } from "react";

/**
 * "Send a fresh link", per narrator, on one chapter of one book.
 *
 * ── ONE COMPONENT, TWO SCREENS, ON PURPOSE ─────────────────────────────────
 *
 * /pickups and the editor card page both show the batch, and both need this.
 * Two copies would be two sets of wording for one action and two ideas of when
 * the button may appear — and the wording is the entire point of the feature:
 * a narrator who misreads it goes looking for corrections that do not exist.
 *
 * ── WHY IT IS PER NARRATOR AND NOT PER CHAPTER ─────────────────────────────
 *
 * Both screens group by chapter, because the chapter is the unit that gets
 * sent. A LINK IS NOT PER CHAPTER: it is per (book, chapter, narrator), so a
 * two-hander chapter holds two batches and two separate tokens. A single
 * chapter-level button would have to either pick one narrator silently or email
 * both — and emailing both means the narrator whose link was fine gets a
 * "your link stopped working" message about a link that did not.
 *
 * ── THE COUNT IS NOT SHOWN ON THE BUTTON ───────────────────────────────────
 *
 * Deliberately unlike "Send 3 drafts" beside it. That button is about work
 * being dispatched and the number is the point; this one replaces a credential
 * and the number of pickups behind it is unchanged by pressing it.
 */

export type PickupBatch = {
  card_id: string;
  chapter: string;
  narrator_id: string;
  narrator_name: string;
  has_email: boolean;
  open_count: number;
  returned_count: number;
  last_link_at: string | null;
  link_live: boolean;
};

type Outcome =
  | { sent: true; narrator: string; email: string }
  | { sent: false; refused: string }
  | { sent: false; failed: string; previousLinkRevoked: true };

function whenSent(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function FreshLinkButtons({
  batches,
  className = "",
  showReminder = false,
}: {
  /** Already filtered to one card and chapter by the caller. */
  batches: PickupBatch[];
  className?: string;
  /**
   * Offer "Remind her" as well.
   *
   * ONLY WHERE SOMETHING IS ACTUALLY PENDING. A reminder about work that has
   * already come back is noise, and on a verified chapter it is nonsense — so
   * the caller says where it belongs rather than this guessing from counts it
   * cannot see the context for.
   */
  showReminder?: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [said, setSaid] = useState<Record<string, { text: string; bad: boolean }>>({});
  // Pressed once and it worked: the token in the last email is now the dead
  // one, so pressing again is a legitimate thing to do — but it should be a
  // decision, not a double-click. The button says so rather than disappearing.
  const [done, setDone] = useState<Record<string, boolean>>({});

  if (batches.length === 0) return null;

  /*
    A NUDGE, NOT A NEW LINK — and the two sit side by side deliberately.

    "Send a fresh link" REVOKES the token she is holding; this one changes
    nothing at all. They are one keystroke apart on screen, so the labels have
    to carry the difference: one says remind, the other says send a fresh link,
    and the refusals name the other when it is the right choice.
  */
  async function remind(b: PickupBatch) {
    if (busy) return;
    setBusy(b.narrator_id);
    setSaid(s => ({ ...s, [b.narrator_id]: { text: "", bad: false } }));
    try {
      const res = await fetch("/api/pickups/remind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: b.card_id, chapter: b.chapter, narratorId: b.narrator_id }),
      });
      if (!res.ok) {
        setSaid(s => ({ ...s, [b.narrator_id]: {
          text: res.status === 401 ? "Your session has expired — sign in again." : `Failed (${res.status}).`,
          bad: true } }));
        return;
      }
      const { outcome } = (await res.json()) as
        { outcome: { sent: true; email: string; outstanding: number } | { sent: false; refused: string } };
      setSaid(s => ({ ...s, [b.narrator_id]: outcome.sent
        ? { text: `Reminded ${outcome.email} about ${outcome.outstanding} pickup${outcome.outstanding === 1 ? "" : "s"}.`, bad: false }
        : { text: outcome.refused, bad: true } }));
    } catch (e) {
      setSaid(s => ({ ...s, [b.narrator_id]: { text: (e as Error).message || "That did not go through.", bad: true } }));
    } finally {
      setBusy(null);
    }
  }

  async function send(b: PickupBatch) {
    if (busy) return;
    setBusy(b.narrator_id);
    setSaid(s => ({ ...s, [b.narrator_id]: { text: "", bad: false } }));
    try {
      const res = await fetch("/api/pickups/fresh-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardId: b.card_id,
          chapter: b.chapter,
          narratorId: b.narrator_id,
        }),
      });
      // A 401 has no `outcome` in it, and reading one would leave the screen
      // silent about the one failure a person can actually act on.
      if (!res.ok) {
        setSaid(s => ({
          ...s,
          [b.narrator_id]: {
            text: res.status === 401 ? "Your session has expired — sign in again." : `Failed (${res.status}).`,
            bad: true,
          },
        }));
        return;
      }
      const { outcome } = (await res.json()) as { outcome: Outcome };
      if (outcome.sent) {
        setDone(d => ({ ...d, [b.narrator_id]: true }));
        setSaid(s => ({
          ...s,
          // The address, because "sent" without a destination is not something
          // anyone can check. It is the one place it is shown.
          [b.narrator_id]: { text: `New link sent to ${outcome.email}.`, bad: false },
        }));
      } else {
        setSaid(s => ({
          ...s,
          [b.narrator_id]: {
            text: "refused" in outcome ? outcome.refused : outcome.failed,
            bad: true,
          },
        }));
      }
    } catch (e) {
      setSaid(s => ({
        ...s,
        [b.narrator_id]: { text: (e as Error).message || "That did not go through.", bad: true },
      }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={`space-y-1.5 ${className}`}>
      {batches.map(b => {
        const msg = said[b.narrator_id];
        const sent = done[b.narrator_id];
        const last = whenSent(b.last_link_at);
        return (
          <div key={b.narrator_id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <button
              type="button"
              disabled={busy !== null || !b.has_email}
              onClick={() => void send(b)}
              title={
                b.has_email
                  ? "Emails a replacement link for pickups this narrator already has. Nothing else changes."
                  : `${b.narrator_name} has no email address on file.`
              }
              className="rounded-lg border border-surface-border px-2.5 py-1 text-[11px] text-text-muted transition-colors hover:border-surface-border hover:text-text-primary disabled:opacity-40"
            >
              {sent ? "Send another link" : "Send a fresh link"} · {b.narrator_name}
            </button>

            {showReminder && b.open_count > 0 && (
              <button
                type="button"
                disabled={busy !== null || !b.has_email}
                onClick={() => void remind(b)}
                title="Emails a nudge about the pickups she already has. Nothing is issued and nothing is revoked."
                className="rounded-lg border border-surface-border px-2.5 py-1 text-[11px] text-text-body transition-colors hover:border-accent-amber/50 hover:text-text-primary disabled:opacity-40"
              >
                Remind {b.narrator_name}
              </button>
            )}

            {/* Context for the decision, not decoration: whether the link she
                holds still works, and roughly when it went out. Someone asking
                "did she ever get one?" can answer it without leaving. */}
            <span className="text-[11px] text-text-muted">
              {b.link_live ? "link live" : "no live link"}
              {last ? ` · sent ${last}` : ""}
            </span>

            {msg?.text && (
              <span className={`text-[11px] ${msg.bad ? "text-alert-red" : "text-capacity-light"}`}>
                {msg.text}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
