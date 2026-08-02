"use client";

import Image from "next/image";
import { useRef, useEffect } from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Calendar, Lock, Square, CheckSquare } from "lucide-react";
import { parseLocalDate, daysUntil, completionUrgency, URGENCY_PILL, parseCoNarrators, estimatedEarnings, type Urgency } from "./board-card-utils";

// Re-exported so existing imports elsewhere (e.g. board/page.tsx) keep working.
export { parseLocalDate, daysUntil };

const LONG_PRESS_MS = 500;

export type BoardV2Card = {
  id: string;
  title: string;
  author: string;
  co_narrator: string | null;
  cover_url: string | null;
  status: string;
  deadline: string | null;
  first15_due: string | null;
  first_15_complete: boolean;
  word_count: number | null;
  pfh_rate: number | null;
  payment_type: string | null;
  is_confidential: boolean;
  narration_format: string | null;
  narrator_share_percent: number | null;
  created_at: string;
};

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

export function BoardCard({
  card,
  onToggleFirst15,
  onLongPress,
  onOpen,
}: {
  card: BoardV2Card;
  onToggleFirst15: (id: string, complete: boolean) => void;
  /** Mobile long-press (500ms) → opens the action menu at (x, y). Desktop
   *  drag is handled separately via dnd-kit and is unaffected by this. */
  onLongPress?: (card: BoardV2Card, x: number, y: number) => void;
  /** Click (not drag) → opens the Card Edit modal (Stage 6.1+). Optional so
   *  the DragOverlay preview instance can render without wiring one up. */
  onOpen?: (card: BoardV2Card) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
    data: { card },
  });

  // Read inside the setTimeout callback for a fresh value — isDragging
  // itself would be stale (captured at schedule-time, not fire-time).
  const isDraggingRef = useRef(isDragging);
  useEffect(() => { isDraggingRef.current = isDragging; }, [isDragging]);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const coNarrators = parseCoNarrators(card.co_narrator);
  const showFormatPill = card.narration_format && card.narration_format !== "solo";

  const style = transform
    ? { transform: CSS.Translate.toString(transform), zIndex: isDragging ? 50 : undefined, opacity: isDragging ? 0.5 : 1 }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onPointerDown={e => {
        listeners?.onPointerDown?.(e);
        const { clientX, clientY } = e;
        longPressTimer.current = setTimeout(() => {
          if (!isDraggingRef.current) onLongPress?.(card, clientX, clientY);
        }, LONG_PRESS_MS);
      }}
      onPointerUp={clearLongPress}
      onPointerLeave={clearLongPress}
      onPointerCancel={clearLongPress}
      onClick={() => { if (!isDragging) onOpen?.(card); }}
      className="relative flex h-[176px] w-full shrink-0 cursor-pointer rounded-lg border border-surface-border bg-surface p-3 transition-colors hover:border-accent-amber-dim hover:bg-surface-raised"
    >
      {card.is_confidential && (
        <Lock size={14} className="absolute right-2 top-2 text-accent-amber-dim" />
      )}

      {/* Cover art — 96x144 (2:3), top-aligned */}
      <div className="relative mr-3 h-36 w-24 shrink-0 overflow-hidden rounded bg-background">
        {card.cover_url && (
          <Image src={card.cover_url} alt={card.title} fill className="object-cover" sizes="96px" />
        )}
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
        <p className="mt-1 truncate text-sm font-medium text-accent-amber">{card.author || " "}</p>

        {/* 3. Co-narrator row — empty but height-preserving when solo */}
        <p className="mt-0.5 truncate text-[13px] text-text-muted">
          {coNarrators.length ? `with ${coNarrators.join(", ")}` : " "}
        </p>

        {/* 4. Dates row */}
        <div className="mt-3 flex min-h-[22px] items-center gap-2">
          {card.deadline && (() => {
            const key = completionUrgency(daysUntil(card.deadline));
            return (
              <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[13px] font-medium ${URGENCY_PILL[key]}`}>
                <Calendar size={12} />
                {formatShortDate(card.deadline)}
              </span>
            );
          })()}

          {card.first15_due && (() => {
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
          {card.word_count ? (() => {
            const earnings = estimatedEarnings(card.word_count, card.pfh_rate, card.payment_type, card.narration_format, card.narrator_share_percent);
            const words = `${card.word_count.toLocaleString()} words`;
            return earnings === null ? words : `${words} · ~$${Math.round(earnings).toLocaleString("en-US")}`;
          })() : " "}
        </p>

        {/* 6. Remaining space intentionally left empty (not vertically centered) */}
      </div>
    </div>
  );
}
