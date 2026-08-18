"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { BUSINESS, PROFILE_PHOTO_URL, ROLE_LABEL } from "@/lib/business-identity";
import {
  LayoutGrid, Calendar, CheckCircle2, Users, Mail, Wrench, DollarSign, Settings as SettingsIcon,
  ChevronLeft, ChevronRight, LogOut, Receipt,
} from "lucide-react";
import { SidebarSection, type NavItem } from "./SidebarSection";
import { useUnreadInquiries } from "./useUnreadInquiries";
import { useAgenda } from "./useAgenda";
import { SidebarAgenda } from "./SidebarAgenda";
import { useLogout } from "./useLogout";

/**
 * The nav in groups rather than one run of nine.
 *
 * Grouped by the question being asked, not by feature: what am I making, what
 * is it worth, who is it for, everything else. Hairline rules rather than
 * headed sections, since headings would add more height than the grouping
 * saves and the icons already carry the meaning.
 */
const NAV_GROUPS: NavItem[][] = [
  [
    { label: "Board", href: "/board", icon: LayoutGrid },
    // The board filters released cards out, so this is the only route to a
    // shipped title. It was reachable only by the board's drop zone, which meant
    // a released book could not be found again once it had left the board.
    { label: "Released", href: "/released", icon: CheckCircle2 },
    { label: "Schedule", href: "/schedule", icon: Calendar },
  ],
  [
    { label: "Payments", href: "/payments", icon: DollarSign },
    { label: "Expenses", href: "/expenses", icon: Receipt },
  ],
  [
    {
      label: "Contacts", href: "/contacts", icon: Users,
      subItems: [
        { label: "Authors", href: "/contacts/authors" },
        { label: "Co-Narrators", href: "/contacts/co-narrators" },
        { label: "Editors", href: "/contacts/editors" },
        { label: "Production Companies", href: "/contacts/production-companies" },
      ],
    },
    { label: "Inquiries", href: "/inquiries", icon: Mail, badge: "inquiries" },
  ],
  [
    {
      label: "Tools", href: "/tools", icon: Wrench,
      // Unlike Contacts, clicking Tools should just open the dropdown — there's
      // no natural "first sub-item" to land on, so deep-linking would silently
      // pick one (Analytics) that isn't obviously "the" Tools page.
      deepLinkOnClick: false,
      subItems: [
        { label: "Analytics", href: "/tools/analytics" },
        { label: "Contract Builder", href: "/tools/contract-builder" },
        { label: "Testimonials", href: "/tools/testimonials" },
        { label: "Demos", href: "/tools/demos" },
        { label: "Prepper", href: "/tools/prepper" },
      ],
    },
    { label: "Settings", href: "/settings", icon: SettingsIcon },
  ],
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
  // Keyed on the route so it refreshes after days or blocks are changed.
  const agenda = useAgenda(pathname);
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
      // self-start and h-screen are what make sticky work at all. As a flex
      // item it was stretching to the full height of the page, and an element
      // as tall as its containing block has nowhere to slide, so `sticky` sat
      // there doing nothing on every long admin page.
      className={`shrink-0 self-start sticky top-0 h-screen flex flex-col bg-surface border-r border-surface-border transition-[width] duration-150 ${
        collapsed ? "w-14" : "w-60"
      }`}
    >
      {/* Top — the way back to the public site.
          Admin routes suppress the public header entirely (Header.tsx returns
          null for them), so the old "DMN Admin" wordmark left no route out of
          admin except editing the URL. */}
      <div className={collapsed ? "px-2 py-3" : "px-3 py-3"}>
        <Link
          href="/"
          title="View public site"
          className="group flex items-center gap-2.5 rounded-lg p-1 transition-colors hover:bg-surface-raised"
        >
          <span className="h-9 w-9 shrink-0 overflow-hidden rounded-full border border-surface-border bg-surface-raised transition-colors group-hover:border-accent-amber/50">
            <Image
              src={PROFILE_PHOTO_URL}
              alt={BUSINESS.name}
              width={36}
              height={36}
              className="object-cover"
              style={{ objectPosition: "center 30%" }}
            />
          </span>
          {!collapsed && (
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-sm font-semibold text-text-primary">{BUSINESS.name}</span>
              <span className="block truncate text-xs text-text-muted">{ROLE_LABEL}</span>
            </span>
          )}
        </Link>
      </div>
      <div className="h-px bg-divider mx-4 mb-2" />

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2">
        {NAV_GROUPS.map((group, i) => (
          <div
            key={group[0].href}
            className={`space-y-0.5 ${i > 0 ? "mt-1.5 border-t border-divider pt-1.5" : ""}`}
          >
            {group.map(item => (
              <SidebarSection
                key={item.href}
                item={item}
                pathname={pathname}
                collapsed={collapsed}
                unreadInquiries={unreadInquiries}
              />
            ))}
          </div>
        ))}
      </nav>

      {/* Today, above the footer so it sits at the bottom of the eye's travel
          down the nav. Hidden when collapsed: there is no useful 56px version
          of a list of titles and hours. */}
      {!collapsed && <SidebarAgenda agenda={agenda} />}

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
