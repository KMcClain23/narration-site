"use client";

import Image from "next/image";
import { Calendar, Lock, Square, CheckSquare } from "lucide-react";
import {
  parseLocalDate,
  daysUntil,
  completionUrgency,
  URGENCY_PILL,
  parseCoNarrators,
  estimatedEarnings,
  narrationPlan,
  stillAtMic,
  type Urgency,
  type BoardV2Card,
} from "./board-card-utils";
import { studioRates, useStudioSettings } from "./useStudioSettings";

// The visual content shared by desktop's BoardCard (drag + mouse long-press)
// and mobile's MobileBoardCard (swipe + touch long-press) — the two own
// completely different interaction models, but render the same card face.

function formatShortDate(s: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(parseLocalDate(s));
}

const URGENCY_TEXT = {
  default: "text-text-body",
  yellow: "text-accent-amber-bright",
  red: "text-alert-red",
} as const;

function first15Urgency(days: number): Urgency {
  if (days < 0) return "red";
  if (days <= 7) return "yellow";
  return "default";
}

export function BoardCardContent({
  card,
  onToggleFirst15,
}: {
  card: BoardV2Card;
  onToggleFirst15: (id: string, complete: boolean) => void;
}) {
  const coNarrators = parseCoNarrators(card.co_narrator);
  const studioState = useStudioSettings();
  // Nullable rates: loading and failed both yield null, and every figure below
  // is gated on that rather than computed from a default.
  const studio = studioRates(studioState);
  const showFormatPill = card.narration_format && card.narration_format !== "solo";

  return (
    <>
      {card.is_confidential && <Lock size={14} className="absolute right-2 top-2 text-accent-amber-dim" />}

      {/* Cover art — 96x144 (2:3), top-aligned */}
      <div className="relative mr-3 h-36 w-24 shrink-0 overflow-hidden rounded bg-background">
        {card.cover_url && <Image src={card.cover_url} alt={card.title} fill className="object-cover" sizes="96px" />}
      </div>

      {/* Right content column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* 1. Title row */}
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="truncate text-[18px] font-bold leading-tight text-text-primary">{card.title}</h3>
          {showFormatPill && (
            <span className="shrink-0 rounded bg-pill-neutral-bg px-2 py-0.5 text-[11px] capitalize text-pill-neutral-text">
              {card.narration_format}
            </span>
          )}
        </div>

        {/* 2. Author row */}
        <p className="mt-1 truncate text-sm font-medium text-accent-amber">{card.author || " "}</p>

        {/* Edited elsewhere, and BY WHOSE ACCOUNT. Dean marking a book is a
            statement about the production; Marizete marking one is a statement
            about herself. Same flag, different claim, so the qualifier is the
            whole point of showing it. */}
        {card.edited_externally && (
          <p className="mt-1 truncate text-[13px] text-text-muted">
            Edited elsewhere
            {card.edited_externally_by_name
              ? ` — marked by ${card.edited_externally_by_name}`
              : ""}
          </p>
        )}

        {/* 3. Co-narrator row — empty but height-preserving when solo */}
        <p className="mt-0.5 truncate text-[13px] text-text-muted">
          {coNarrators.length ? `with ${coNarrators.join(", ")}` : " "}
        </p>

        {/* 4. Dates row */}
        <div className="mt-3 flex min-h-[22px] items-center gap-2">
          {card.deadline &&
            (() => {
              const key = completionUrgency(daysUntil(card.deadline));
              return (
                <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[13px] font-medium ${URGENCY_PILL[key]}`}>
                  <Calendar size={12} />
                  {formatShortDate(card.deadline)}
                </span>
              );
            })()}

          {card.first15_due &&
            (() => {
              const key = card.first_15_complete ? "default" : first15Urgency(daysUntil(card.first15_due));
              return (
                <button
                  type="button"
                  onPointerDown={e => e.stopPropagation()}
                  onClick={e => { e.stopPropagation(); onToggleFirst15(card.id, !card.first_15_complete); }}
                  className="flex items-center gap-1"
                >
                  {card.first_15_complete ? (
                    <CheckSquare size={14} className="text-text-muted" />
                  ) : (
                    <Square size={14} className="text-text-muted" />
                  )}
                  <span className="text-[11px] text-text-muted">15:</span>
                  <span className={`text-[13px] font-medium ${card.first_15_complete ? "text-text-muted line-through" : URGENCY_TEXT[key]}`}>
                    {formatShortDate(card.first15_due)}
                  </span>
                </button>
              );
            })()}
        </div>

        {/* 5. Word count row — empty but height-preserving when unset */}
        <p className="mt-2 text-sm text-text-dim">
          {card.word_count
            ? (() => {
                const earnings = estimatedEarnings(card.word_count, card.pfh_rate, card.payment_type, card.narration_format, card.narrator_share_percent, studio.wordsPerFinishedHour);
                const words = `${card.word_count.toLocaleString()} words`;
                return earnings === null ? words : `${words} · ~$${Math.round(earnings).toLocaleString("en-US")}`;
              })()
            : " "}
        </p>

        {/* 6. Booth load — height-preserving, same as the row above, so cards
            stay a uniform height whether or not a word count is set. */}
        <p className="mt-0.5 text-[13px]">
          {(() => {
            // Nothing to say once the mic work is done. The row keeps its
            // height so cards stay uniform down the column.
            if (!stillAtMic(card.status)) return " ";
            const plan = narrationPlan({
              wordCount: card.word_count,
              narrationFormat: card.narration_format,
              narratorSharePercent: card.narrator_share_percent,
              deadline: card.deadline,
              schedule: { dates: card.recording_dates },
              wordsPerHour: studio.wordsPerNarrationHour,
              wordsRecorded: card.words_recorded ?? 0,
            });
            if (!plan) return " ";
            const started = plan.fractionDone > 0.005;
            if (plan.hours <= 0.005) {
              return <span className="text-capacity-light">Recording complete</span>;
            }
            return (
              <>
                <span className="text-text-muted">
                  {plan.hours.toFixed(1)} hrs {started ? "left" : "at the mic"}
                </span>
                {/* Only once there is progress to report. An untouched book
                    saying "0% done" is noise on every card in the column. */}
                {started && (
                  <span className="text-text-dim"> · {Math.round(plan.fractionDone * 100)}% done</span>
                )}
                {plan.overdue ? (
                  <span className="text-alert-red"> · no recording days left</span>
                ) : plan.hoursPerDay != null ? (
                  // The threshold is an emphasis, not a figure. Without it the day
                  // renders unhighlighted, which is the ordinary state and asserts
                  // nothing — a highlight derived from a guessed threshold would
                  // claim a day is heavy on no authority at all.
                  <span
                    className={
                      studio.heavyDayHours != null && plan.hoursPerDay >= studio.heavyDayHours
                        ? "text-accent-amber-bright"
                        : "text-text-muted"
                    }
                  >
                    {" · "}
                    {plan.hoursPerDay.toFixed(1)} hrs/day
                  </span>
                ) : null}
              </>
            );
          })()}
        </p>
      </div>
    </>
  );
}
