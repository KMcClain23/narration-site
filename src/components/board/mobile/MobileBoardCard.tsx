"use client";

import { useRef, useState } from "react";
import { useDrag } from "@use-gesture/react";
import { Archive } from "lucide-react";
import type { BoardV2Card } from "@/components/admin/board-card-utils";
import { BoardCardContent } from "@/components/admin/BoardCardContent";

const LONG_PRESS_MS = 500;
// Distance (px) the card must travel left before release counts as "archive".
const ARCHIVE_THRESHOLD = -90;
// A fast enough leftward flick archives even short of the distance threshold.
const ARCHIVE_VELOCITY = 0.5;
// Clamp — the card can't be dragged further left than this even mid-gesture.
const MAX_SWIPE = -110;

export function MobileBoardCard({
  card,
  onToggleFirst15,
  onLongPress,
  onOpen,
  onSwipeArchive,
}: {
  card: BoardV2Card;
  onToggleFirst15: (id: string, complete: boolean) => void;
  onLongPress: (card: BoardV2Card, x: number, y: number) => void;
  onOpen: (card: BoardV2Card) => void;
  onSwipeArchive: (card: BoardV2Card) => void;
}) {
  const [x, setX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const suppressClickRef = useRef(false);
  const draggedRef = useRef(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set only when the timer actually fires (not on every press) — the click
  // that follows a touchend after a completed long-press shouldn't ALSO open
  // the edit modal underneath the action menu it just opened.
  const longPressFiredRef = useRef(false);

  const clearLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const bind = useDrag(
    ({ down, first, last, movement: [mx], velocity: [vx], direction: [xDir] }) => {
      if (first) draggedRef.current = false;
      if (Math.abs(mx) > 5) draggedRef.current = true;

      if (last) {
        setDragging(false);
        const pastThreshold = mx < ARCHIVE_THRESHOLD;
        const fastFlick = vx > ARCHIVE_VELOCITY && xDir < 0;
        if (pastThreshold || fastFlick) {
          setX(MAX_SWIPE);
          suppressClickRef.current = true;
          onSwipeArchive(card);
          // The archive dialog covers the card the whole time it's open, so
          // it's safe to always settle back here — on cancel, the card is
          // already back in place; on confirm, it's about to unmount anyway.
          setTimeout(() => {
            setX(0);
            suppressClickRef.current = false;
          }, 250);
        } else {
          setX(0);
        }
        return;
      }

      setDragging(down);
      // Leftward only — clamp both ends so it can't be dragged rightward or
      // past MAX_SWIPE.
      setX(Math.max(MAX_SWIPE, Math.min(0, mx)));
    },
    { axis: "x", filterTaps: true }
  );

  const revealFraction = Math.min(1, x / ARCHIVE_THRESHOLD);

  // Captured once per render so the composed handlers below and the spread
  // both reference the same bound functions — @use-gesture's own
  // onPointerDown/Up/etc must still run (it needs them for pointer capture
  // and gesture tracking), so these compose rather than replace them, same
  // pattern BoardCard.tsx already uses to layer its long-press timer on top
  // of dnd-kit's listeners.
  const gestureBind = bind();

  return (
    <div className="relative">
      {/* Archive affordance revealed behind the card as it swipes left */}
      <div
        className="absolute inset-0 flex items-center justify-end rounded-lg bg-alert-red pr-6"
        style={{ opacity: revealFraction }}
        aria-hidden="true"
      >
        <Archive size={22} className="text-white" />
      </div>

      <div
        {...gestureBind}
        style={{
          transform: `translateX(${x}px)`,
          touchAction: "pan-y",
          transition: dragging ? "none" : "transform 200ms ease",
        }}
        onPointerDown={e => {
          gestureBind.onPointerDown?.(e);
          longPressFiredRef.current = false;
          const { clientX, clientY } = e;
          longPressTimer.current = setTimeout(() => {
            if (!draggedRef.current) {
              longPressFiredRef.current = true;
              onLongPress(card, clientX, clientY);
            }
          }, LONG_PRESS_MS);
        }}
        onPointerUp={e => {
          gestureBind.onPointerUp?.(e);
          clearLongPress();
        }}
        onPointerLeave={e => {
          gestureBind.onPointerLeave?.(e);
          clearLongPress();
        }}
        onPointerCancel={e => {
          gestureBind.onPointerCancel?.(e);
          clearLongPress();
        }}
        onClick={e => {
          gestureBind.onClick?.(e);
          if (suppressClickRef.current || draggedRef.current || longPressFiredRef.current) return;
          onOpen(card);
        }}
        className="relative flex h-[176px] w-full shrink-0 cursor-pointer rounded-lg border border-surface-border bg-surface p-3"
      >
        <BoardCardContent card={card} onToggleFirst15={onToggleFirst15} />
      </div>
    </div>
  );
}
