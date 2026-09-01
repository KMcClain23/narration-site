"use client";

import { createContext, useCallback, useContext, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { createClient } from "@/lib/supabase/browser";

/**
 * Dragging a book between the three sections that are hers.
 *
 * ── WHY ONLY THREE ─────────────────────────────────────────────────────────
 *
 * "Coming next" is `status IN ('recording','prepping')`, "Not yet" is earlier
 * still, and "Finished" is `editing_completed_at`. Those are Dean's production
 * state, and `board_cards` has exactly one update policy — admin only. She
 * cannot write them and should not be offered them.
 *
 * THE ILLEGAL TARGETS ARE NOT DROPPABLES AT ALL. They are not registered with
 * dnd-kit, so they cannot highlight and cannot receive a drop — inert by
 * construction rather than by a check that runs after the gesture. A drop that
 * is accepted and then refused teaches people the feature is broken.
 *
 * ── AND WHY EVERY DRAG HAS A BUTTON ────────────────────────────────────────
 *
 * This is the primary action on the page. A drag-only control is unusable to
 * anyone not holding a mouse, so Claim stays and "Edited elsewhere" gains one.
 * dnd-kit's KeyboardSensor also makes the drag itself keyboard-operable —
 * space to lift, arrows to move, space to drop — but that is the belt, and the
 * buttons are the braces.
 *
 * TouchSensor is registered with a hold delay so a tap still scrolls the page
 * and opens a tile; without the delay a list becomes undraggable-and-unscrollable
 * on a tablet, which is where she is most likely to be.
 *
 * ── THE OPTIMISTIC MOVE IS REAL, NOT A SPINNER ─────────────────────────────
 *
 * The tiles are server-rendered and passed in as children, so they cannot be
 * teleported between sections in the browser. Instead the source tile hides
 * itself the instant the drop lands and the destination renders a placeholder
 * carrying the title — the book appears to move, and on failure it reappears
 * where it was with a sentence saying what did not happen. It is never left
 * looking moved when the write failed.
 */

/** The three sections she may move a book between. */
export type Zone = "mine" | "unclaimed" | "elsewhere";

const ZONE_LABEL: Record<Zone, string> = {
  mine: "your queue",
  unclaimed: "Unclaimed",
  elsewhere: "Edited elsewhere",
};

type Pending = { cardId: string; title: string; to: Zone } | null;

type Ctx = {
  pending: Pending;
  error: string;
  dismissError: () => void;
  /** The button path, identical in effect to the drag path. */
  move: (cardId: string, title: string, from: Zone, to: Zone) => void;
};

const HubCtx = createContext<Ctx | null>(null);
export const useHub = () => useContext(HubCtx);

export function HubDrag({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [pending, setPending] = useState<Pending>(null);
  const [dragging, setDragging] = useState<{ title: string; from: Zone } | null>(null);
  const [error, setError] = useState("");

  const sensors = useSensors(
    // A small distance so a click on the tile still opens the book.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // A hold, so a scroll gesture on a tablet is still a scroll.
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  /**
   * One place where a move becomes RPC calls, used by the drag and the buttons
   * alike. Two paths to the same effect must not be two implementations of the
   * rule about which RPC a transition needs.
   */
  const move = useCallback(
    (cardId: string, title: string, from: Zone, to: Zone) => {
      if (from === to || pending) return;
      setError("");
      setPending({ cardId, title, to });

      void (async () => {
        let err: { message: string } | null = null;
        if (to === "mine") {
          // From either source: claiming is the same call, and it also has to
          // clear the flag if the book was marked edited elsewhere.
          if (from === "elsewhere") {
            ({ error: err } = await supabase.rpc("set_edited_externally", {
              p_card_id: cardId, p_value: false,
            }));
          }
          if (!err) ({ error: err } = await supabase.rpc("claim_card_for_editing", { p_card_id: cardId }));
        } else if (to === "unclaimed") {
          if (from === "mine") {
            ({ error: err } = await supabase.rpc("release_card_editing", { p_card_id: cardId }));
          } else {
            ({ error: err } = await supabase.rpc("set_edited_externally", {
              p_card_id: cardId, p_value: false,
            }));
          }
        } else {
          // Edited elsewhere. The setter releases her own claim in the same
          // transaction, so "claimed -> elsewhere" is one call, not two.
          ({ error: err } = await supabase.rpc("set_edited_externally", {
            p_card_id: cardId, p_value: true,
          }));
        }

        if (err) {
          // REVERTED. The tile reappears where it was, and the message says
          // what did not happen rather than that something went wrong.
          setPending(null);
          setError(`${title} was not moved to ${ZONE_LABEL[to]}. ${err.message}`);
          return;
        }
        // Held until the refreshed server render arrives, so the tile does not
        // flicker back to its old section for a frame.
        startTransition(() => {
          router.refresh();
          setPending(null);
        });
      })();
    },
    [pending, router, supabase],
  );

  const ctx = useMemo<Ctx>(
    () => ({ pending, error, dismissError: () => setError(""), move }),
    [pending, error, move],
  );

  return (
    <HubCtx.Provider value={ctx}>
      <DndContext
        sensors={sensors}
        onDragStart={(e: DragStartEvent) => {
          const d = e.active.data.current as { title: string; from: Zone } | undefined;
          if (d) setDragging({ title: d.title, from: d.from });
        }}
        onDragEnd={(e: DragEndEvent) => {
          setDragging(null);
          const d = e.active.data.current as { title: string; from: Zone } | undefined;
          const to = e.over?.id as Zone | undefined;
          if (!d || !to) return;
          move(String(e.active.id), d.title, d.from, to);
        }}
        onDragCancel={() => setDragging(null)}
      >
        {error && (
          <div
            role="status"
            className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-alert-red/40 bg-alert-red/10 px-4 py-3 text-sm text-alert-red"
          >
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError("")}
              className="shrink-0 text-xs underline-offset-2 hover:underline"
            >
              Dismiss
            </button>
          </div>
        )}
        {children}
        <DragOverlay>
          {dragging && (
            <div className="rounded-xl border border-accent-amber/60 bg-surface-raised px-3 py-2 text-sm text-text-primary shadow-lg">
              {dragging.title}
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </HubCtx.Provider>
  );
}

/**
 * A section that accepts a drop. Only the three legal ones are wrapped in it;
 * everything else on the page is not a droppable and therefore inert.
 */
export function DropZone({
  zone,
  children,
  className = "",
}: {
  zone: Zone;
  children: React.ReactNode;
  className?: string;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: zone });
  const hub = useHub();
  const incoming = hub?.pending && hub.pending.to === zone ? hub.pending : null;

  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl transition-colors ${
        isOver ? "bg-accent-amber/10 outline-2 outline-dashed outline-accent-amber/60" : ""
      } ${className}`}
    >
      {children}
      {incoming && (
        // THE OPTIMISTIC HALF. The tile has already vanished from its old
        // section; this is where it has gone until the server render catches up.
        <div className="mt-2 rounded-xl border border-dashed border-accent-amber/50 bg-surface px-3 py-2 text-sm text-text-muted">
          {incoming.title} — moving…
        </div>
      )}
    </div>
  );
}

/**
 * One draggable tile. The book's own markup is passed straight through as
 * children, so this adds a grip and a hidden state and changes nothing about
 * how the tile looks.
 */
export function DragTile({
  cardId,
  title,
  from,
  children,
}: {
  cardId: string;
  title: string;
  from: Zone;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: cardId,
    data: { title, from },
  });
  const hub = useHub();

  // Gone from here the moment the drop lands — the other half of the move.
  if (hub?.pending?.cardId === cardId) return null;

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      aria-label={`${title}. Draggable. Currently in ${ZONE_LABEL[from]}.`}
      className={`cursor-grab rounded-xl focus-visible:outline-2 focus-visible:outline-accent-amber active:cursor-grabbing ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      {children}
    </div>
  );
}

/**
 * The non-drag equivalent, for every move that has no button already.
 *
 * Claim and Unclaim already exist as buttons and keep working; this is what
 * makes "Edited elsewhere" reachable without a pointer.
 */
export function MoveButton({
  cardId,
  title,
  from,
  to,
  label,
  className = "",
}: {
  cardId: string;
  title: string;
  from: Zone;
  to: Zone;
  label: string;
  className?: string;
}) {
  const hub = useHub();
  const busy = hub?.pending?.cardId === cardId;
  return (
    <button
      type="button"
      disabled={busy || !hub}
      onClick={e => {
        e.preventDefault();
        e.stopPropagation();
        hub?.move(cardId, title, from, to);
      }}
      className={`rounded-full border border-surface-border px-3 py-1 text-[11px] text-text-body transition-colors hover:border-accent-amber/50 hover:text-text-primary disabled:opacity-50 ${className}`}
    >
      {busy ? "…" : label}
    </button>
  );
}
