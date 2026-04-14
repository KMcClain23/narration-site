"use client";

import BackToTopButton from "./BackToTopButton";
import { useActiveWelcomeSection } from "./useActiveWelcomeSection";
import { welcomeNavItems } from "./welcomeNavItems";

export default function WelcomeSectionNav() {
  const activeId = useActiveWelcomeSection();

  return (
    <aside className="hidden lg:block">
      <div className="sticky top-24">
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-[#0B1020]/70 p-4 backdrop-blur-md shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
            <p className="text-xs uppercase tracking-[0.22em] text-[#D4AF37]">
              On this page
            </p>

            <nav className="mt-4">
              <ul className="space-y-1.5">
                {welcomeNavItems.map((item) => {
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

          <div className="flex justify-start pl-2">
            <BackToTopButton />
          </div>
        </div>
      </div>
    </aside>
  );
}