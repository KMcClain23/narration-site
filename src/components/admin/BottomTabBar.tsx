"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Calendar, Users, Mail, Menu } from "lucide-react";
import { useIsAnyModalOpen } from "./AdminModalContext";
import { useUnreadInquiries } from "./useUnreadInquiries";
import { MoreSheet } from "./MoreSheet";

type Tab = {
  label: string;
  href: string;
  icon: typeof LayoutGrid;
  match: (pathname: string) => boolean;
};

const TABS: Tab[] = [
  { label: "Board", href: "/board", icon: LayoutGrid, match: p => p.startsWith("/board") },
  { label: "Schedule", href: "/schedule", icon: Calendar, match: p => p.startsWith("/schedule") },
  // Deep-links straight to Authors, same convention as the desktop sidebar's
  // parent-row-links-to-first-sub-item pattern (/contacts itself is a
  // server-redirect page).
  { label: "Contacts", href: "/contacts/authors", icon: Users, match: p => p.startsWith("/contacts") },
  { label: "Inquiries", href: "/inquiries", icon: Mail, match: p => p.startsWith("/inquiries") },
];

const SCROLL_THRESHOLD = 10;

export function BottomTabBar() {
  const pathname = usePathname();
  const unreadInquiries = useUnreadInquiries();
  const isAnyModalOpen = useIsAnyModalOpen();
  const [moreOpen, setMoreOpen] = useState(false);
  const [scrollHidden, setScrollHidden] = useState(false);
  const lastScrollY = useRef(0);

  // Close the sheet on navigation — adjusted during render (not an effect),
  // per React's guidance for resetting state when a prop changes.
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setMoreOpen(false);
  }

  useEffect(() => {
    lastScrollY.current = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const delta = y - lastScrollY.current;
      if (Math.abs(delta) < SCROLL_THRESHOLD) return;
      // Never hide right at the top — a small downward jitter from y=0
      // shouldn't hide the bar before the user has actually scrolled.
      setScrollHidden(delta > 0 && y > 64);
      lastScrollY.current = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const hiddenByModal = isAnyModalOpen;
  const hiddenByScroll = scrollHidden && !moreOpen;
  const translateHidden = hiddenByModal || hiddenByScroll;

  return (
    <>
      <nav
        aria-hidden={hiddenByModal}
        className={`fixed inset-x-0 bottom-0 z-[200] border-t border-surface-border bg-surface transition-transform duration-200 ${
          translateHidden ? "translate-y-full" : "translate-y-0"
        }`}
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex h-16">
          {TABS.map(tab => {
            const active = tab.match(pathname);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className="relative flex flex-1 flex-col items-center justify-center gap-1"
              >
                {active && <span className="absolute inset-x-0 top-0 h-[2px] bg-accent-amber" />}
                <span className="relative">
                  <Icon size={24} className={active ? "text-accent-amber" : "text-text-muted"} />
                  {tab.label === "Inquiries" && unreadInquiries > 0 && (
                    <span className="absolute -right-2 -top-1.5 min-w-[16px] rounded-full bg-accent-amber px-1 text-center text-[10px] font-bold leading-[16px] text-background">
                      {unreadInquiries}
                    </span>
                  )}
                </span>
                <span className={`text-[11px] ${active ? "text-accent-amber" : "text-text-muted"}`}>{tab.label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(o => !o)}
            className="relative flex flex-1 flex-col items-center justify-center gap-1"
          >
            {moreOpen && <span className="absolute inset-x-0 top-0 h-[2px] bg-accent-amber" />}
            <Menu size={24} className={moreOpen ? "text-accent-amber" : "text-text-muted"} />
            <span className={`text-[11px] ${moreOpen ? "text-accent-amber" : "text-text-muted"}`}>More</span>
          </button>
        </div>
      </nav>

      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
    </>
  );
}
