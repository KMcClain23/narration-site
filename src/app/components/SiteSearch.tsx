"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";

// ─── search index ─────────────────────────────────────────────────────────────

type Entry = { url: string; page: string; title: string; keywords: string[] };

const INDEX: Entry[] = [
  // ── Homepage ──────────────────────────────────────────────────────────────
  {
    url: "/#demos", page: "Homepage", title: "Audio Demos",
    keywords: ["demo","audio","listen","sample","play","hear","voice","narration",
      "romance","romantasy","lgbtq","duet","british","accent","character",
      "dialogue","multi-character","portfolio","reel","show"],
  },
  {
    url: "/#testimonials", page: "Homepage", title: "Testimonials & Reviews",
    keywords: ["testimonial","review","author","feedback","quote","recommendation",
      "clients","what authors say","praise","experience","worked with"],
  },
  {
    url: "/#about", page: "Homepage", title: "About Dean Miller",
    keywords: ["about","bio","background","narrator","professional","who is dean",
      "experience","specialties","dark romance","romantasy","lgbtq","thriller",
      "drama","music","theatre","voice range"],
  },
  {
    url: "/#about", page: "Homepage", title: "Studio & Equipment",
    keywords: ["studio","equipment","shure","mv7","mic","microphone","acoustic",
      "treated","home studio","broadcast quality","acx ready","mastering",
      "production","recording","setup","sound","quality"],
  },
  {
    url: "/#about", page: "Homepage", title: "Services & Genres",
    keywords: ["service","genre","dark romance","romantasy","thriller","drama",
      "lgbtq","fantasy","fiction","solo","duet","co-narrator","multicast",
      "british","accent","what do you narrate","speciali"],
  },
  {
    url: "/#process", page: "Homepage", title: "What to Expect / Process",
    keywords: ["expect","process","how it works","workflow","steps","approval",
      "first 15","first-15","first fifteen","milestone","pickups","character voice list",
      "communication","livestream","timeline","turnaround","48 hours","delivery"],
  },
  {
    url: "/#process", page: "Homepage", title: "Cover Art Requirements",
    keywords: ["cover","cover art","artwork","image","jpeg","png","size",
      "resolution","thumbnail","audible cover","acx cover","guidelines",
      "requirements","spec","specifications"],
  },
  {
    url: "/#contact", page: "Homepage", title: "Contact & Get a Quote",
    keywords: ["contact","inquiry","get in touch","quote","rate","price","cost",
      "pfh","per finished hour","hire","commission","work together","budget",
      "available","availability","booking","request","project"],
  },
  {
    url: "/#contact", page: "Homepage", title: "Book a Call",
    keywords: ["call","schedule","calendar","book","meeting","free call",
      "15 minute","consultation","talk","chat","phone","video","outlook"],
  },
  {
    url: "/#contact", page: "Homepage", title: "Direct Email",
    keywords: ["email","direct email","dean@dmnarration","message","reach out",
      "send email","response time","reply","inbox"],
  },
  {
    url: "/#contact", page: "Homepage", title: "Social Media",
    keywords: ["social","tiktok","instagram","acx","audible","find me",
      "profile","follow","links"],
  },

  // ── Other pages ───────────────────────────────────────────────────────────
  {
    url: "/narrated-works", page: "Portfolio", title: "Narrated Works",
    keywords: ["narrated","books","portfolio","titles","audiobook","catalog",
      "completed","in progress","coming soon","browse","all books",
      "published","audible","released"],
  },
  {
    url: "/welcome", page: "Info", title: "Working Together / Author Guide",
    keywords: ["welcome","working together","author guide","process","how to",
      "get started","what to send","manuscript","submission","contract",
      "agreement","onboarding","faq","frequently asked"],
  },
  {
    url: "/leave-a-review", page: "Reviews", title: "Leave a Review",
    keywords: ["review","leave a review","testimonial","feedback","recommend",
      "endorse","submit review","write review"],
  },
];

// ─── same-page pulse animation (injected once) ────────────────────────────────

let pulseStyled = false;
function ensurePulseStyle() {
  if (pulseStyled || typeof document === "undefined") return;
  pulseStyled = true;
  const s = document.createElement("style");
  s.textContent = `
    @keyframes searchPulse {
      0%   { outline-color: rgba(212,175,55,0.7); }
      60%  { outline-color: rgba(212,175,55,0.3); }
      100% { outline-color: rgba(212,175,55,0);   }
    }
    .search-pulse {
      outline: 2px solid rgba(212,175,55,0.7);
      outline-offset: 4px;
      border-radius: 14px;
      animation: searchPulse 1.4s ease forwards;
    }
  `;
  document.head.appendChild(s);
}

// ─── component ────────────────────────────────────────────────────────────────

export function SiteSearch() {
  const [open, setOpen]             = useState(false);
  const [query, setQuery]           = useState("");
  const [highlighted, setHighlighted] = useState(-1);
  const inputRef  = useRef<HTMLInputElement>(null);
  const router    = useRouter();
  const pathname  = usePathname();

  useEffect(() => { ensurePulseStyle(); }, []);

  // Filter + deduplicate
  const results: Entry[] = (() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const seen = new Set<string>();
    return INDEX.filter(e => {
      const key = `${e.url}::${e.title}`;
      if (seen.has(key)) return false;
      const hit = e.title.toLowerCase().includes(q) ||
                  e.keywords.some(k => k.toLowerCase().includes(q));
      if (hit) seen.add(key);
      return hit;
    });
  })();

  const openModal  = useCallback(() => { setOpen(true);  setQuery(""); setHighlighted(-1); }, []);
  const closeModal = useCallback(() => { setOpen(false); setQuery(""); setHighlighted(-1); }, []);

  // Auto-focus input
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 40);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Cmd K / Ctrl K  +  Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        open ? closeModal() : openModal();
      }
      if (e.key === "Escape" && open) closeModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, openModal, closeModal]);

  // Navigate to result
  const navigate = useCallback((url: string) => {
    closeModal();
    const isHashOnly = url.startsWith("/#");
    if (isHashOnly && pathname === "/") {
      // Same page — scroll + pulse
      const id = url.slice(2);
      requestAnimationFrame(() => {
        const el = document.getElementById(id);
        if (!el) return;
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        el.classList.remove("search-pulse");
        void el.offsetWidth;
        el.classList.add("search-pulse");
        setTimeout(() => el.classList.remove("search-pulse"), 1500);
      });
    } else {
      router.push(url);
    }
  }, [closeModal, pathname, router]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted(h => results.length ? Math.min(h + 1, results.length - 1) : -1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted(h => Math.max(h - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = highlighted >= 0 ? results[highlighted] : results[0];
      if (target) navigate(target.url);
    }
  };

  const noResults = query.trim().length >= 2 && results.length === 0;

  return (
    <>
      {/* ── Trigger button in header ── */}
      <button
        type="button"
        onClick={openModal}
        aria-label="Search site (Cmd K)"
        className="flex items-center gap-2 text-white/50 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#06082E] rounded"
      >
        <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24"
          stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
        </svg>
        <kbd className="hidden lg:inline-flex items-center gap-0.5 text-[10px] text-white/25 border border-white/10 rounded px-1.5 py-0.5 font-sans">
          ⌘K
        </kbd>
      </button>

      {/* ── Modal overlay ── */}
      {open && (
        <div
          className="fixed inset-0 z-[200] flex items-start justify-center pt-[12vh] px-4"
          style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
          onClick={e => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div
            className="w-full max-w-xl rounded-2xl border border-white/12 overflow-hidden"
            style={{
              background: "rgba(7,10,46,0.98)",
              boxShadow: "0 32px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.04)",
            }}
          >
            {/* Input row */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/8">
              <svg className="h-4 w-4 text-white/35 shrink-0" fill="none" viewBox="0 0 24 24"
                stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
              </svg>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => { setQuery(e.target.value); setHighlighted(-1); }}
                onKeyDown={onKeyDown}
                placeholder="Search pages and sections…"
                className="flex-1 bg-transparent text-sm text-white placeholder:text-white/25 focus:outline-none"
                aria-label="Search"
                role="combobox"
                aria-expanded={results.length > 0}
                aria-haspopup="listbox"
              />
              <button
                type="button"
                onClick={closeModal}
                aria-label="Close search"
                className="text-white/25 hover:text-white/60 transition-colors shrink-0"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24"
                  stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>

            {/* Results */}
            {query.trim().length > 0 && (
              <ul role="listbox" className="max-h-72 overflow-y-auto">
                {noResults ? (
                  <li className="px-4 py-5 text-sm text-white/40">
                    No results —{" "}
                    <button type="button"
                      onClick={() => navigate("/#contact")}
                      className="text-[#D4AF37] hover:underline underline-offset-2">
                      Contact Dean
                    </button>
                    {" "}for anything else
                  </li>
                ) : (
                  results.map((entry, i) => (
                    <li key={`${entry.url}::${entry.title}`} role="option" aria-selected={highlighted === i}>
                      <button
                        type="button"
                        onClick={() => navigate(entry.url)}
                        onMouseEnter={() => setHighlighted(i)}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-white/[0.05] last:border-0 transition-colors ${
                          highlighted === i
                            ? "bg-[#D4AF37]/10 text-white"
                            : "text-white/65 hover:bg-white/[0.04] hover:text-white/90"
                        }`}
                      >
                        <svg
                          className={`h-3.5 w-3.5 shrink-0 transition-colors ${highlighted === i ? "text-[#D4AF37]" : "text-white/20"}`}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                        </svg>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium">{entry.title}</span>
                          <span className="ml-2 text-[10px] text-white/30">{entry.page}</span>
                        </div>
                        <span className="text-[10px] text-white/20 shrink-0">↵</span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}

            {/* Empty state / hint */}
            {query.trim().length === 0 && (
              <div className="px-4 py-5 grid grid-cols-2 gap-2">
                {["Audio Demos", "Narrated Works", "Contact", "Working Together"].map(hint => (
                  <button key={hint} type="button"
                    onClick={() => setQuery(hint)}
                    className="text-left text-xs text-white/35 hover:text-white/60 px-3 py-2 rounded-lg border border-white/6 hover:border-white/15 transition-colors">
                    {hint}
                  </button>
                ))}
              </div>
            )}

            {/* Footer */}
            <div className="px-4 py-2.5 border-t border-white/6 flex items-center gap-4 text-[10px] text-white/20">
              <span>↑↓ navigate</span>
              <span>↵ select</span>
              <span>Esc close</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
