"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutGrid, Calendar, Users, Mail, Wrench, Settings as SettingsIcon,
  ChevronLeft, ChevronRight, LogOut,
} from "lucide-react";
import { SidebarSection, type NavItem } from "./SidebarSection";
import { useUnreadInquiries } from "./useUnreadInquiries";
import { useLogout } from "./useLogout";

const NAV_ITEMS: NavItem[] = [
  { label: "Board", href: "/board", icon: LayoutGrid },
  { label: "Schedule", href: "/schedule", icon: Calendar },
  {
    label: "Contacts", href: "/contacts", icon: Users,
    subItems: [
      { label: "Authors", href: "/contacts/authors" },
      { label: "Co-Narrators", href: "/contacts/co-narrators" },
      { label: "Production Companies", href: "/contacts/production-companies" },
    ],
  },
  { label: "Inquiries", href: "/inquiries", icon: Mail, badge: "inquiries" },
  {
    label: "Tools", href: "/tools", icon: Wrench,
    subItems: [
      { label: "Analytics", href: "/tools/analytics" },
      { label: "Contract Builder", href: "/tools/contract-builder" },
      { label: "Testimonials", href: "/tools/testimonials" },
      { label: "Demos", href: "/tools/demos" },
      { label: "Prepper", href: "/tools/prepper" },
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
  const unreadInquiries = useUnreadInquiries();
  const { logout: handleLogout, loggingOut } = useLogout();

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev;
      localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      return next;
    });
  };

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
        {NAV_ITEMS.map(item => (
          <SidebarSection
            key={item.href}
            item={item}
            pathname={pathname}
            collapsed={collapsed}
            unreadInquiries={unreadInquiries}
          />
        ))}
      </nav>

      {/* Sign out + Collapse toggle */}
      <div className="p-2 border-t border-surface-border space-y-0.5">
        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          title={collapsed ? "Sign out" : undefined}
          className="w-full flex items-center gap-3 rounded-lg px-2.5 py-2 text-text-muted hover:bg-surface hover:text-text-primary transition-colors disabled:opacity-50"
        >
          <LogOut size={16} className="shrink-0" />
          {!collapsed && <span className="text-xs">{loggingOut ? "Signing out…" : "Sign out"}</span>}
        </button>
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
