"use client";

import { useEffect, useMemo, useState } from "react";

type NavItem = {
  id: string;
  label: string;
};

const navItems: NavItem[] = [
  { id: "welcome", label: "Welcome" },
  { id: "process-overview", label: "Process Overview" },
  { id: "what-i-handle", label: "What I Handle" },
  { id: "manuscript-notes", label: "Manuscript & Notes" },
  { id: "production-sample", label: "The First 15" },
  { id: "recording-process", label: "Recording Process" },
  { id: "live-streaming", label: "Live Streaming" },
  { id: "delivery-review", label: "Delivery & Review" },
  { id: "timeline-communication", label: "Timeline" },
  { id: "payment", label: "Payment" },
  { id: "helpful-links", label: "Helpful Links" },
  { id: "promotion-support", label: "Promotion Support" },
  { id: "about", label: "About Dean" },
  { id: "final-note", label: "Final Note" },
];

export default function WelcomeSectionNav() {
  const [activeId, setActiveId] = useState<string>("welcome");

  const sectionIds = useMemo(() => navItems.map((item) => item.id), []);

  useEffect(() => {
    const handleScroll = () => {
      const sections = sectionIds
        .map((id) => document.getElementById(id))
        .filter((el): el is HTMLElement => Boolean(el));

      if (sections.length === 0) return;

      const scrollPosition = window.scrollY + 140;
      let currentId = sectionIds[0];

      for (const section of sections) {
        if (section.offsetTop <= scrollPosition) {
          currentId = section.id;
        }
      }

      setActiveId(currentId);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll);

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, [sectionIds]);

  return (
    <aside className="hidden lg:block">
      <div className="sticky top-24">
        <div className="rounded-2xl border border-white/10 bg-[#0B1020]/70 p-4 backdrop-blur-md shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
          <p className="text-xs uppercase tracking-[0.22em] text-[#D4AF37]">
            On this page
          </p>

          <nav className="mt-4">
            <ul className="space-y-1.5">
              {navItems.map((item) => {
                const active = item.id === activeId;

                return (
                  <li key={item.id}>
                    <a
                      href={`#${item.id}`}
                      className={[
                        "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition",
                        active
                          ? "bg-[#D4AF37]/12 text-white"
                          : "text-white/65 hover:bg-white/[0.04] hover:text-white",
                      ].join(" ")}
                      aria-current={active ? "location" : undefined}
                    >
                      <span
                        className={[
                          "h-2 w-2 shrink-0 rounded-full transition",
                          active
                            ? "bg-[#D4AF37] shadow-[0_0_12px_rgba(212,175,55,0.55)]"
                            : "bg-white/15 group-hover:bg-white/40",
                        ].join(" ")}
                      />
                      <span className="leading-5">{item.label}</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      </div>
    </aside>
  );
}