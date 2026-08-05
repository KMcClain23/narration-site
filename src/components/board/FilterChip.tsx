"use client";

export function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors ${
        active
          ? "bg-accent-amber text-background"
          : "border border-surface-border text-text-body hover:border-accent-amber-dim"
      }`}
    >
      {label}
    </button>
  );
}
