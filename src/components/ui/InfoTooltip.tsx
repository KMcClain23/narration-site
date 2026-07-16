"use client";

import { useState, useRef, useEffect, useCallback, useId } from "react";
import type { CSSProperties, ReactNode } from "react";
import { createPortal } from "react-dom";

// ─── reusable "?" info tooltip ─────────────────────────────────────────────────
// Opens on hover (desktop) and click (touch, and as a toggle everywhere).
// Position is measured and flipped to stay on-screen — no dependency pulled in
// for this since neither Radix nor Floating UI is installed in this project.

const MAX_WIDTH = 280;
const GAP = 6;
const MARGIN = 8;
const HOVER_CLOSE_DELAY = 150;

export function InfoTooltip({
  children,
  variant = "label",
}: {
  children: ReactNode;
  variant?: "label" | "inline";
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({ opacity: 0, pointerEvents: "none" });

  const triggerRef  = useRef<HTMLButtonElement>(null);
  const popoverRef  = useRef<HTMLDivElement>(null);
  const closeTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = useId();

  useEffect(() => { setMounted(true); }, []);

  const clearCloseTimer = () => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
  };

  const show = useCallback(() => { clearCloseTimer(); setOpen(true); }, []);
  const scheduleHide = useCallback(() => {
    clearCloseTimer();
    closeTimer.current = setTimeout(() => setOpen(false), HOVER_CLOSE_DELAY);
  }, []);
  const hideNow = useCallback(() => { clearCloseTimer(); setOpen(false); }, []);

  // Position — render off-screen first to measure real height, then place
  // with viewport-aware flipping (below by default, above if it doesn't fit;
  // clamped horizontally so it never runs off the left/right edge).
  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    if (!trigger) return;

    setStyle({ position: "fixed", top: -9999, left: -9999, width: MAX_WIDTH, opacity: 0, pointerEvents: "none", zIndex: 9999 });

    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        const popover = popoverRef.current;
        if (!popover) return;

        const rect = trigger.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const ph = popover.scrollHeight;

        let left = rect.left;
        if (left + MAX_WIDTH + MARGIN > vw) left = vw - MAX_WIDTH - MARGIN;
        left = Math.max(MARGIN, left);

        const spaceBelow = vh - rect.bottom - MARGIN;
        const spaceAbove = rect.top - MARGIN;
        const flipUp = ph > spaceBelow && spaceAbove > spaceBelow;
        const top = flipUp
          ? Math.max(MARGIN, rect.top - ph - GAP)
          : rect.bottom + GAP;

        setStyle({
          position: "fixed",
          top,
          left,
          width: MAX_WIDTH,
          opacity: 1,
          pointerEvents: "auto",
          zIndex: 9999,
        });
      });
    });

    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
  }, [open]);

  // Outside click / Escape / Tab-trap while open
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      hideNow();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        hideNow();
        triggerRef.current?.focus();
        return;
      }
      if (e.key === "Tab" && popoverRef.current) {
        const focusables = popoverRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus();
        }
      }
    };

    document.addEventListener("mousedown", onPointerDown, true);
    document.addEventListener("touchstart", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown, true);
      document.removeEventListener("touchstart", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open, hideNow]);

  const wrapperClass = variant === "inline"
    ? "inline-block align-middle ml-1.5"
    : "inline-flex align-middle ml-1.5";

  return (
    <span className={wrapperClass}>
      <button
        ref={triggerRef}
        type="button"
        aria-label="More info"
        aria-haspopup="true"
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onMouseEnter={show}
        onMouseLeave={scheduleHide}
        onFocus={show}
        onBlur={scheduleHide}
        onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}
        className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-white/25 text-[10px] font-medium leading-none text-white/40 transition-colors hover:border-white/50 hover:text-white/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]/50"
      >
        ?
      </button>

      {mounted && open && createPortal(
        <div
          ref={popoverRef}
          id={id}
          role="tooltip"
          onMouseEnter={show}
          onMouseLeave={scheduleHide}
          onFocus={show}
          onBlur={scheduleHide}
          style={style}
          className="space-y-1.5 rounded-lg border border-white/10 bg-[#0D1050] px-3 py-2.5 text-xs leading-relaxed text-white/70 shadow-2xl [&_strong]:font-semibold [&_strong]:text-white/90 [&_ul]:list-disc [&_ul]:pl-4 [&_p+p]:mt-1.5"
        >
          {children}
        </div>,
        document.body
      )}
    </span>
  );
}
