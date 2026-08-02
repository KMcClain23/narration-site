"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";

const ROW_CLS =
  "flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors hover:bg-surface-raised active:bg-surface-raised";

// Icon is optional — most rows in the More sheet's flat Tools list don't have
// one specced, but the slot is always reserved so labels stay aligned
// whether or not a given row has an icon.
export function MoreSheetItem({
  icon: Icon,
  label,
  href,
  onClick,
}: {
  icon?: LucideIcon;
  label: string;
  href?: string;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span className="flex h-5 w-5 shrink-0 items-center justify-center">
        {Icon && <Icon size={18} className="text-text-muted" />}
      </span>
      <span className="text-sm text-text-body">{label}</span>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={ROW_CLS}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={ROW_CLS}>
      {content}
    </button>
  );
}
