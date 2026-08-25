"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { useModalOpen } from "@/components/admin/AdminModalContext";
import { quarterFromIndex, quarterLabel } from "@/lib/schedule-capacity";

/**
 * Jump straight to a quarter instead of stepping through them.
 *
 * Built the same way MoreSheet is — stays mounted and animates on an `open`
 * class rather than being conditionally rendered — so the leaving transition
 * has something to play on. The two cannot collide: AdminModalContext counts
 * registrations rather than holding a single boolean, precisely so two sheets
 * that open independently cannot clobber each other's closed signal.
 */
export function QuarterPickerSheet({
  open,
  onClose,
  min,
  max,
  activeIndex,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  min: number;
  max: number;
  activeIndex: number;
  onPick: (index: number) => void;
}) {
  useModalOpen(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const indices: number[] = [];
  for (let i = min; i <= max; i++) indices.push(i);

  return (
    <>
      <div
        className={`fixed inset-0 z-[300] bg-black/60 transition-opacity ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        } ${open ? "duration-200 ease-out" : "duration-150 ease-in"}`}
        onClick={onClose}
        aria-hidden={!open}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-hidden={!open}
        aria-label="Choose a quarter"
        className={`fixed inset-x-0 bottom-0 z-[310] rounded-t-2xl border-t border-surface-border bg-surface shadow-2xl transition-transform ${
          open ? "translate-y-0 duration-200 ease-out" : "pointer-events-none translate-y-full duration-150 ease-in"
        }`}
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-surface-border" />

        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="text-base font-bold text-text-primary">Jump to quarter</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-text-muted hover:text-text-primary">
            <X size={20} />
          </button>
        </div>

        {/* Bounded by the data, but capped in height anyway — a catalogue that
            stretches years out should scroll rather than fill the screen. */}
        <div className="admin-scrollbar max-h-[50dvh] overflow-y-auto px-2 pb-3">
          {indices.map(i => {
            const isActive = i === activeIndex;
            return (
              <button
                key={i}
                type="button"
                onClick={() => { onPick(i); onClose(); }}
                aria-current={isActive ? "true" : undefined}
                className={`flex w-full items-center justify-between rounded-lg px-4 py-3 text-left text-sm transition-colors ${
                  isActive ? "bg-surface-raised font-bold text-accent-amber" : "text-text-body hover:bg-surface-raised"
                }`}
              >
                <span>{quarterLabel(quarterFromIndex(i))}</span>
                {isActive && <span className="text-[11px] uppercase tracking-[0.08em] text-text-faint">Showing</span>}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
