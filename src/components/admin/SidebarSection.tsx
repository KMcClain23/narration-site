"use client";

import Link from "next/link";
import { ChevronDown, type LucideIcon } from "lucide-react";

export type SubNavItem = { label: string; href: string };
export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  subItems?: SubNavItem[];
  badge?: "inquiries";
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
  const autoExpanded = !collapsed && !!item.subItems && pathname.startsWith(item.href);
  const Icon = item.icon;

  return (
    <div>
      <Link
        href={item.href}
        title={collapsed ? item.label : undefined}
        aria-current={leafActive ? "page" : undefined}
        className={`group relative flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors ${
          leafActive
            ? "bg-surface-raised text-text-primary"
            : sectionActive
              ? "text-text-primary"
              : "text-text-muted hover:bg-surface hover:text-text-primary"
        }`}
      >
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
            className={`shrink-0 text-text-dim transition-transform ${autoExpanded ? "" : "-rotate-90"}`}
          />
        )}
      </Link>

      {/* Sub-nav — collapsed by default, auto-expands on section routes only */}
      {!collapsed && item.subItems && autoExpanded && (
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
