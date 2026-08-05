"use client";

import { useEffect, useRef } from "react";
import { X, Headphones, Settings as SettingsIcon, LogOut } from "lucide-react";
import { useModalOpen } from "./AdminModalContext";
import { useLogout } from "./useLogout";
import { MoreSheetItem } from "./MoreSheetItem";

const SWIPE_DOWN_THRESHOLD = 60;

export function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { logout, loggingOut } = useLogout();
  const touchStartY = useRef<number | null>(null);

  // The sheet itself counts as a modal for tab-bar-hide purposes — it's
  // rendered by BottomTabBar, which is exactly what it would otherwise hide.
  useModalOpen(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY.current == null) return;
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;
    if (deltaY > SWIPE_DOWN_THRESHOLD) onClose();
    touchStartY.current = null;
  };

  return (
    <>
      <div
        className={`fixed inset-0 z-[300] bg-black/60 transition-opacity duration-200 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
        aria-hidden={!open}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-hidden={!open}
        aria-label="More"
        className={`fixed inset-x-0 bottom-0 z-[310] rounded-t-2xl border-t border-surface-border bg-surface shadow-2xl transition-transform duration-200 ${
          open ? "translate-y-0" : "pointer-events-none translate-y-full"
        }`}
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-surface-border" />

        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="text-base font-bold text-text-primary">More</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-text-muted hover:text-text-primary">
            <X size={20} />
          </button>
        </div>

        <div className="px-2 pb-2">
          <p className="px-4 pb-1 pt-1 text-[11px] font-medium uppercase tracking-[0.08em] text-text-faint">Tools</p>
          <MoreSheetItem icon={Headphones} label="Demos" href="/tools/demos" />
          <MoreSheetItem label="Analytics" href="/tools/analytics" />
          <MoreSheetItem label="Contract Builder" href="/tools/contract-builder" />
          <MoreSheetItem label="Testimonials" href="/tools/testimonials" />
          <MoreSheetItem label="Prepper" href="/tools/prepper" />

          <div className="my-2 h-px bg-surface-border" />
          <MoreSheetItem icon={SettingsIcon} label="Settings" href="/settings" />

          <div className="my-2 h-px bg-surface-border" />
          <MoreSheetItem icon={LogOut} label={loggingOut ? "Signing out…" : "Sign out"} onClick={logout} />
        </div>
      </div>
    </>
  );
}
