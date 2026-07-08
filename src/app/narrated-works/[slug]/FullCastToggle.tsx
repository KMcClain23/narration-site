"use client";

import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";

// ─── shared open/close state for the compact trigger + the full cast panel ────
// The trigger (under the cover) and the panel (below the hero grid) are not
// nested inside one another, so they need a shared context rather than local
// component state.

type CastContextValue = { open: boolean; setOpen: (open: boolean) => void };

const CastContext = createContext<CastContextValue | null>(null);

export function useCast(): CastContextValue {
  const ctx = useContext(CastContext);
  if (!ctx) throw new Error("useCast must be used within a FullCastProvider");
  return ctx;
}

export function FullCastProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <CastContext.Provider value={{ open, setOpen }}>{children}</CastContext.Provider>;
}

// ─── trigger: compact "+N co-narrators" pill under the cover ──────────────────

export function FullCastTrigger({ count }: { count: number }) {
  const { open, setOpen } = useCast();
  return (
    <button
      type="button"
      onClick={() => setOpen(!open)}
      aria-expanded={open}
      aria-controls="full-cast"
      className="mt-0.5 text-[11px] font-semibold text-[#D4AF37]/70 hover:text-[#D4AF37] transition-colors underline underline-offset-2"
    >
      {open ? "Hide co-narrators" : `+ ${count} co-narrators`}
    </button>
  );
}

// ─── panel: animated expand/collapse for the full cast row ────────────────────
// Animates height via grid-template-rows (0fr -> 1fr) instead of max-height,
// since max-height would need a hardcoded guess at the content's real height.
// Tailwind v4 here doesn't have tailwindcss-animate installed, so this avoids
// pulling in a dependency for a single transition.

export function FullCastPanel({ children }: { children: ReactNode }) {
  const { open } = useCast();
  return (
    <div
      id="full-cast"
      className="grid transition-[grid-template-rows] duration-300 ease-in-out"
      style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      aria-hidden={!open}
    >
      <div className="overflow-hidden">
        <div className={`mt-4 border-t border-white/8 pt-8 transition-opacity duration-200 ${open ? "opacity-100 delay-100" : "opacity-0"}`}>
          {children}
        </div>
      </div>
    </div>
  );
}
