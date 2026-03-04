"use client";

import * as React from "react";

type QuickLink = {
  label: string;
  href: string;
};

const STORAGE_KEY = "dmn_admin_quicklinks_open";

export default function QuickLinks({
  links,
  defaultOpen = true,
}: {
  links: QuickLink[];
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState<boolean>(defaultOpen);

  React.useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === "true") setOpen(true);
      if (saved === "false") setOpen(false);
    } catch {
      // ignore
    }
  }, []);

  React.useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(open));
    } catch {
      // ignore
    }
  }, [open]);

  return (
    <section className="mt-10">
      <div className="rounded-2xl border border-[#1A2550] bg-[#0B1224] shadow-xl overflow-hidden">
        <div className="p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-white/30 text-[10px] uppercase tracking-[0.2em] font-bold">
                Quick Links
              </p>
              <p className="mt-1 text-sm text-white/70">
                Your business tools in one place.
                <span className="ml-2 text-white/40 text-xs">
                  {links.length} links
                </span>
              </p>
            </div>

            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="rounded-md border border-[#1A2550] bg-[#050814]/40 px-4 py-2 text-xs font-bold text-white/80 transition hover:bg-white/[0.03] hover:border-[#D4AF37]/40"
              aria-expanded={open}
            >
              {open ? "Hide" : "Show"}
            </button>
          </div>

          <div className="mt-5 h-px w-full bg-[#1A2550]" />
        </div>

        {open ? (
          <div className="px-6 pb-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {links.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group rounded-xl border border-[#1A2550] bg-[#050814]/40 px-4 py-3 transition hover:bg-white/[0.03] hover:border-[#D4AF37]/40"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-white">
                      {link.label}
                    </span>
                    <span className="text-xs text-white/50 group-hover:text-[#D4AF37] transition">
                      ↗
                    </span>
                  </div>

                  <p className="mt-1 text-[11px] text-white/40 break-all">
                    {link.href}
                  </p>
                </a>
              ))}
            </div>
          </div>
        ) : (
          <div className="px-6 pb-6">
            <p className="text-sm text-white/50">
              Hidden. Click{" "}
              <span className="text-white/80 font-semibold">Show</span> anytime.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}