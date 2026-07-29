"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutGrid, Calendar, Users, Mail, Headphones, Wrench, Settings as SettingsIcon,
  ChevronLeft, ChevronRight, ChevronDown,
  type LucideIcon,
} from "lucide-react";

type SubNavItem = { label: string; href: string };
type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  subItems?: SubNavItem[];
  badge?: "inquiries";
};

const NAV_ITEMS: NavItem[] = [
  { label: "Board", href: "/board-v2", icon: LayoutGrid },
  { label: "Schedule", href: "/schedule", icon: Calendar },
  {
    label: "Contacts", href: "/contacts", icon: Users,
    subItems: [
      { label: "Authors", href: "/contacts/authors" },
      { label: "Co-Narrators", href: "/contacts/co-narrators" },
      { label: "Production Companies", href: "/contacts/production-companies" },
    ],
  },
  { label: "Inquiries", href: "/inquiries-v2", icon: Mail, badge: "inquiries" },
  { label: "Demos", href: "/demos-v2", icon: Headphones },
  {
    label: "Tools", href: "/tools", icon: Wrench,
    subItems: [
      { label: "Analytics", href: "/tools/analytics" },
      { label: "Contract Builder", href: "/tools/contract-builder" },
    ],
  },
  { label: "Settings", href: "/settings", icon: SettingsIcon },
];

const COLLAPSE_KEY = "dmn_admin_sidebar_collapsed";

export function Sidebar() {
  const pathname = usePathname();
  // Lazy initializer reads the persisted choice directly — SSR has no
  // window/localStorage, so it falls back to expanded there.
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(COLLAPSE_KEY) === "1";
  });
  const [unreadInquiries, setUnreadInquiries] = useState(0);

  // Same source the current inquiries admin view reads — same Redis-backed
  // list, no separate/hardcoded count logic.
  useEffect(() => {
    fetch("/api/inquiries")
      .then(r => (r.ok ? r.json() : []))
      .then(data => setUnreadInquiries(Array.isArray(data) ? data.length : 0))
      .catch(() => {});
  }, []);

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev;
      localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      return next;
    });
  };

  const isSectionActive = (item: NavItem) =>
    item.subItems ? pathname.startsWith(item.href) : pathname === item.href;

  return (
    <aside
      className={`shrink-0 min-h-screen sticky top-0 flex flex-col bg-surface border-r border-surface-border transition-[width] duration-150 ${
        collapsed ? "w-14" : "w-60"
      }`}
    >
      {/* Top */}
      <div className="px-4 py-4">
        {collapsed ? (
          <p className="font-semibold text-[16px] text-text-primary text-center" title="DMN Admin">D</p>
        ) : (
          <p className="font-semibold text-[16px] text-text-primary">DMN Admin</p>
        )}
      </div>
      <div className="h-px bg-divider mx-4 mb-2" />

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 space-y-0.5">
        {NAV_ITEMS.map(item => {
          const sectionActive = isSectionActive(item);
          const leafActive = sectionActive && !item.subItems;
          const autoExpanded = !collapsed && !!item.subItems && pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <div key={item.href}>
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
        })}
      </nav>

      {/* Collapse toggle */}
      <div className="p-2 border-t border-surface-border">
        <button
          type="button"
          onClick={toggleCollapsed}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-text-muted hover:bg-surface hover:text-text-primary transition-colors"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          {!collapsed && <span className="text-xs">Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
