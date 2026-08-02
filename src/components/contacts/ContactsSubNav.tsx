"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { label: "Authors", href: "/contacts/authors" },
  { label: "Co-Narrators", href: "/contacts/co-narrators" },
  { label: "Production Companies", href: "/contacts/production-companies" },
];

// Mobile-only — desktop navigates Contacts sub-sections via the Sidebar.
// Rendered on all five /contacts/* pages (the 3 list pages and their 2
// [slug] detail pages) so section navigation stays available mid-browse.
// Uses startsWith so a detail page (e.g. /contacts/authors/some-slug) keeps
// "Authors" highlighted — desktop's sidebar sub-items use exact match and so
// don't highlight on detail pages, but that's a pre-existing desktop quirk
// not worth replicating here.
export function ContactsSubNav() {
  const pathname = usePathname();

  return (
    <div className="mb-6 flex gap-1 overflow-x-auto border-b border-surface-border md:hidden">
      {TABS.map(t => {
        const active = pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
              active ? "border-accent-amber text-text-primary" : "border-transparent text-text-muted"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
