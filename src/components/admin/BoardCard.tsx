"use client";

import { useRef, useEffect } from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { parseLocalDate, daysUntil, type BoardV2Card } from "./board-card-utils";
import { BoardCardContent } from "./BoardCardContent";

// Re-exported so existing imports elsewhere (e.g. board/page.tsx) keep working.
export { parseLocalDate, daysUntil };
export type { BoardV2Card };

const LONG_PRESS_MS = 500;

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
  // Set only when the timer actually fires (not on every press) — the click
  // event that follows a mouseup/touchend after a completed long-press
  // shouldn't ALSO open the edit modal underneath the action menu it just
  // opened. Reset at the start of each new press.
  const longPressFiredRef = useRef(false);

  const clearLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

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
        longPressFiredRef.current = false;
        const { clientX, clientY } = e;
        longPressTimer.current = setTimeout(() => {
          if (!isDraggingRef.current) {
            longPressFiredRef.current = true;
            onLongPress?.(card, clientX, clientY);
          }
        }, LONG_PRESS_MS);
      }}
      onPointerUp={clearLongPress}
      onPointerLeave={clearLongPress}
      onPointerCancel={clearLongPress}
      onClick={() => { if (!isDragging && !longPressFiredRef.current) onOpen?.(card); }}
      className="relative flex h-[176px] w-full shrink-0 cursor-pointer rounded-lg border border-surface-border bg-surface p-3 transition-colors hover:border-accent-amber-dim hover:bg-surface-raised"
    >
      <BoardCardContent card={card} onToggleFirst15={onToggleFirst15} />
    </div>
  );
}
