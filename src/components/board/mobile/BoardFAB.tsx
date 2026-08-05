"use client";

import { Plus } from "lucide-react";
import { useHideOnScrollDown } from "@/components/admin/useHideOnScrollDown";
import { useIsAnyModalOpen } from "@/components/admin/AdminModalContext";

// Mobile-only replacement for desktop's inline "+ New Project" button.
// Shares the same scroll-hide signal as the Stage 1 tab bar (via the same
// hook, not literal shared state) so the two move in visual lockstep, and
// hides during any open modal for the same reason the tab bar does.
export function BoardFAB({ onClick }: { onClick: () => void }) {
  const scrollHidden = useHideOnScrollDown();
  const modalOpen = useIsAnyModalOpen();
  const hidden = scrollHidden || modalOpen;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="New Project"
      className={`fixed bottom-24 right-5 z-[150] flex h-14 w-14 items-center justify-center rounded-full bg-accent-amber text-background shadow-2xl transition-all duration-200 ${
        hidden ? "translate-y-24 opacity-0 pointer-events-none" : "translate-y-0 opacity-100"
      }`}
    >
      <Plus size={26} strokeWidth={2.5} />
    </button>
  );
}
