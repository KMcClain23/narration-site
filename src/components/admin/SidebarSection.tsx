"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, type LucideIcon } from "lucide-react";

export type SubNavItem = { label: string; href: string };
export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  subItems?: SubNavItem[];
  badge?: "inquiries";
  /** Default true (Contacts' existing behavior): clicking the parent row
   *  deep-links straight to the first sub-item. Set false to make the
   *  parent row a pure dropdown toggle instead — click just opens/closes
   *  the sub-item list, no navigation. */
  deepLinkOnClick?: boolean;
};

export function SidebarSection({
  item,
  pathname,
  collapsed,
  unreadInquiries,
}: {
  item: NavItem;
  pathname: string;
  collapsed: boolean;
  unreadInquiries: number;
}) {
  const sectionActive = item.subItems ? pathname.startsWith(item.href) : pathname === item.href;
  const leafActive = sectionActive && !item.subItems;
  const deepLink = item.deepLinkOnClick !== false;

  // Toggle-mode sections (deepLink: false) need real open/closed state —
  // there's no sub-page to land on that would derive it from the pathname
  // the way deep-linking sections do.
  const [manuallyOpen, setManuallyOpen] = useState(false);
  const expanded = !collapsed && !!item.subItems && (sectionActive || (!deepLink && manuallyOpen));

  const Icon = item.icon;
  // Deep-linking parent rows go straight to their first sub-item —
  // item.href itself is a server-redirect page (e.g. /contacts ->
  // /contacts/authors), and routing a client-side Link through it causes a
  // visible flash of the previous page while the two hops resolve.
  // item.href is still used above for active-state matching, since that
  // needs the parent prefix to cover every sub-item.
  const linkHref = item.subItems?.[0]?.href ?? item.href;

  // text-left is load-bearing: toggle sections render as <button>, which
  // centers its text by default, so Tools sat visibly indented from every
  // link beside it.
  const rowClassName = `group relative flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors ${
    leafActive
      ? "bg-surface-raised text-text-primary"
      : sectionActive
        ? "text-text-primary"
        : "text-text-muted hover:bg-surface hover:text-text-primary"
  }`;

  const rowContent = (
    <>
      {leafActive && (
        <span className="absolute left-0 top-1 bottom-1 w-[3px] rounded-full bg-accent-amber" />
      )}
      <Icon
        size={18}
        className={`shrink-0 ${sectionActive ? "text-accent-amber" : "text-text-muted group-hover:text-text-primary"}`}
      />
      {!collapsed && <span className="flex-1 text-sm truncate">{item.label}</span>}
      {!collapsed && item.badge === "inquiries" && unreadInquiries > 0 && (
        <span className="shrink-0 min-w-[18px] text-center rounded-full bg-accent-amber text-background text-[11px] font-bold px-1.5 py-0.5">
          {unreadInquiries}
        </span>
      )}
      {!collapsed && item.subItems && (
        <ChevronDown
          size={14}
          className={`shrink-0 text-text-dim transition-transform ${expanded ? "" : "-rotate-90"}`}
        />
      )}
    </>
  );

  return (
    <div>
      {deepLink ? (
        <Link href={linkHref} title={collapsed ? item.label : undefined} aria-current={leafActive ? "page" : undefined} className={rowClassName}>
          {rowContent}
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => setManuallyOpen((v) => !v)}
          title={collapsed ? item.label : undefined}
          aria-expanded={expanded}
          className={`w-full ${rowClassName}`}
        >
          {rowContent}
        </button>
      )}

      {/* Sub-nav — collapsed by default, expands on section routes (deep-link
          sections) or on click (toggle sections). */}
      {!collapsed && item.subItems && expanded && (
        <div className="ml-[26px] mt-0.5 mb-1 space-y-0.5 border-l border-surface-border pl-3">
          {item.subItems.map(sub => {
            const active = pathname === sub.href;
            return (
              <Link
                key={sub.href}
                href={sub.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex items-center rounded-md px-2 py-1.5 text-[13px] transition-colors ${
                  active
                    ? "bg-surface-raised text-text-primary"
                    : "text-text-muted hover:bg-surface hover:text-text-primary"
                }`}
              >
                {active && (
                  <span className="absolute left-[-13px] top-0.5 bottom-0.5 w-[3px] rounded-full bg-accent-amber" />
                )}
                {sub.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
