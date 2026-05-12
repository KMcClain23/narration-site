"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";

// ─── types ────────────────────────────────────────────────────────────────────

type Entry = {
  url:      string;
  page:     string;
  title:    string;
  keywords: string[];
  meta?:    string;     // "by Author" or category label shown under title
  cover?:   string;     // book cover_url for thumbnail
};

// ─── static site index ────────────────────────────────────────────────────────

const STATIC_INDEX: Entry[] = [
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
      "british","accent","what do you narrate"],
  },
  {
    url: "/#process", page: "Homepage", title: "What to Expect / Process",
    keywords: ["expect","process","how it works","workflow","steps","approval",
      "first 15","first-15","first fifteen","milestone","pickups","character voice list",
      "communication","livestream","timeline","turnaround","48 hours","delivery"],
  },
  {
    url: "/#process", page: "Homepage", title: "Cover Art Requirements",
    keywords: ["cover art","artwork","image","jpeg","png","size","resolution",
      "thumbnail","audible cover","acx cover","guidelines","requirements","spec"],
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
    keywords: ["social","tiktok","instagram","acx","audible","find me","profile","follow"],
  },
  {
    url: "/narrated-works", page: "Portfolio", title: "Narrated Works — Full Catalog",
    keywords: ["narrated","books","portfolio","titles","audiobook","catalog",
      "completed","in progress","coming soon","browse","all books","published","released"],
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

// ─── slug helper (mirrors what the narrated-works pages use) ─────────────────

function makeSlug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

const CATEGORY_LABEL: Record<string, string> = {
  "completed":   "Completed",
  "in-progress": "Currently narrating",
  "coming-soon": "Coming soon",
};

// ─── pulse animation (injected once) ─────────────────────────────────────────

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
  const [open, setOpen]               = useState(false);
  const [query, setQuery]             = useState("");
  const [highlighted, setHighlighted] = useState(-1);
  const [bookEntries, setBookEntries] = useState<Entry[]>([]);
  const [booksLoaded, setBooksLoaded] = useState(false);

  const inputRef   = useRef<HTMLInputElement>(null);
  const router     = useRouter();
  const pathname   = usePathname();

  useEffect(() => { ensurePulseStyle(); }, []);

  // Fetch books once on mount and build dynamic entries
  useEffect(() => {
    fetch("/api/books")
      .then(r => r.json())
      .then(data => {
        if (!data.books) return;
        const entries: Entry[] = (data.books as Array<{
          title: string; author?: string; subtitle?: string; tags?: string[];
          description?: string; co_narrator?: string[]; category?: string;
          cover_url?: string; slug?: string;
        }>).map(book => {
          const slug = book.slug || makeSlug(book.title);
          const coNarrators = Array.isArray(book.co_narrator)
            ? book.co_narrator.filter(Boolean)
            : [];
          return {
            url:   `/narrated-works/${slug}`,
            page:  "Portfolio",
            title: book.title,
            meta:  book.author ? `by ${book.author}` : (CATEGORY_LABEL[book.category ?? ""] ?? ""),
            cover: book.cover_url,
            keywords: [
              book.title,
              book.author   ?? "",
              book.subtitle ?? "",
              ...(book.tags ?? []),
              ...(coNarrators as string[]),
              CATEGORY_LABEL[book.category ?? ""] ?? "",
              book.description?.slice(0, 200) ?? "",
            ]
              .filter(Boolean)
              .map(s => s.toLowerCase()),
          };
        });
        setBookEntries(entries);
        setBooksLoaded(true);
      })
      .catch(() => setBooksLoaded(true));
  }, []);

  // ── filtering ───────────────────────────────────────────────────────────────

  const allEntries = [...STATIC_INDEX, ...bookEntries];

  const { pageResults, bookResults } = (() => {
    const q = query.trim().toLowerCase();
    if (!q) return { pageResults: [], bookResults: [] };

    const seenStatic = new Set<string>();
    const seenBooks  = new Set<string>();

    const pages: Entry[] = [];
    const books: Entry[] = [];

    for (const e of STATIC_INDEX) {
      const key = `${e.url}::${e.title}`;
      if (seenStatic.has(key)) continue;
      const hit = e.title.toLowerCase().includes(q) ||
                  e.keywords.some(k => k.includes(q));
      if (hit) { seenStatic.add(key); pages.push(e); }
    }

    for (const e of bookEntries) {
      const key = e.url;
      if (seenBooks.has(key)) continue;
      // Boost exact title match
      const hit = e.title.toLowerCase().includes(q) ||
                  e.keywords.some(k => k.includes(q));
      if (hit) { seenBooks.add(key); books.push(e); }
    }

    // Sort books: exact title match first
    books.sort((a, b) => {
      const aExact = a.title.toLowerCase().startsWith(q) ? -1 : 0;
      const bExact = b.title.toLowerCase().startsWith(q) ? -1 : 0;
      return aExact - bExact;
    });

    return { pageResults: pages, bookResults: books.slice(0, 8) };
  })();

  const totalResults = pageResults.length + bookResults.length;
  const flatResults  = [...pageResults, ...bookResults];
  const noResults    = query.trim().length >= 2 && totalResults === 0 && booksLoaded;

  // ── open / close ────────────────────────────────────────────────────────────

  const openModal  = useCallback(() => { setOpen(true);  setQuery(""); setHighlighted(-1); }, []);
  const closeModal = useCallback(() => { setOpen(false); setQuery(""); setHighlighted(-1); }, []);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 40);
      return () => clearTimeout(t);
    }
  }, [open]);

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

  // ── navigation ──────────────────────────────────────────────────────────────

  const navigate = useCallback((url: string) => {
    closeModal();
    if (url.startsWith("/#") && pathname === "/") {
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
      setHighlighted(h => flatResults.length ? Math.min(h + 1, flatResults.length - 1) : -1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted(h => Math.max(h - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = highlighted >= 0 ? flatResults[highlighted] : flatResults[0];
      if (target) navigate(target.url);
    }
  };

  // ── render ──────────────────────────────────────────────────────────────────

  const ResultRow = ({ entry, idx }: { entry: Entry; idx: number }) => {
    const isHighlighted = highlighted === idx;
    const isBook = !!entry.cover || entry.url.startsWith("/narrated-works/") && entry.url !== "/narrated-works";
    return (
      <button
        type="button"
        onClick={() => navigate(entry.url)}
        onMouseEnter={() => setHighlighted(idx)}
        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left border-b border-white/[0.05] last:border-0 transition-colors ${
          isHighlighted
            ? "bg-[#D4AF37]/10 text-white"
            : "text-white/65 hover:bg-white/[0.04] hover:text-white/90"
        }`}
      >
        {/* Cover thumbnail for books */}
        {isBook ? (
          <div className="h-9 w-6 rounded shrink-0 overflow-hidden bg-white/5 border border-white/8">
            {entry.cover ? (
              <Image src={entry.cover} alt={entry.title} width={24} height={36}
                className="object-cover w-full h-full" />
            ) : (
              <div className="w-full h-full bg-white/5" />
            )}
          </div>
        ) : (
          <svg
            className={`h-3.5 w-3.5 shrink-0 transition-colors ${isHighlighted ? "text-[#D4AF37]" : "text-white/20"}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
          </svg>
        )}

        {/* Text */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="text-sm font-medium truncate">{entry.title}</span>
            <span className="text-[10px] text-white/30 shrink-0">{entry.page}</span>
          </div>
          {entry.meta && (
            <p className="text-[11px] text-white/35 truncate leading-tight mt-0.5">{entry.meta}</p>
          )}
        </div>

        <span className="text-[10px] text-white/20 shrink-0">↵</span>
      </button>
    );
  };

  return (
    <>
      {/* ── Trigger ── */}
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

      {/* ── Modal ── */}
      {open && (
        <>
          {/* Overlay — closes on any click outside the panel */}
          <div
            className="fixed inset-0 z-[199]"
            style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
            onClick={closeModal}
          />
          <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[10vh] px-4 pointer-events-none">
          <div
            className="pointer-events-auto w-full max-w-xl rounded-2xl border border-white/12 overflow-hidden"
            style={{
              background: "rgba(7,10,46,0.98)",
              boxShadow: "0 32px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.04)",
            }}
          >
            {/* Input */}
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
                placeholder="Search pages, books, authors, tags…"
                className="flex-1 bg-transparent text-sm text-white placeholder:text-white/25 focus:outline-none"
                aria-label="Search"
                role="combobox"
                aria-expanded={totalResults > 0}
                aria-haspopup="listbox"
              />
              {!booksLoaded && (
                <span className="h-3.5 w-3.5 border border-white/20 border-t-white/50 rounded-full animate-spin shrink-0" />
              )}
              <button type="button" onClick={closeModal} aria-label="Close"
                className="text-white/25 hover:text-white/60 transition-colors shrink-0">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24"
                  stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>

            {/* Results */}
            {query.trim().length > 0 ? (
              <ul role="listbox" className="max-h-80 overflow-y-auto">
                {noResults ? (
                  <li className="px-4 py-5 text-sm text-white/40">
                    No results —{" "}
                    <button type="button" onClick={() => navigate("/#contact")}
                      className="text-[#D4AF37] hover:underline underline-offset-2">
                      Contact Dean
                    </button>
                    {" "}for anything else
                  </li>
                ) : (
                  <>
                    {/* Page / section results */}
                    {pageResults.length > 0 && (
                      <>
                        {bookResults.length > 0 && (
                          <li className="px-4 pt-3 pb-1">
                            <span className="text-[10px] uppercase tracking-[0.18em] text-white/25 font-semibold">Pages</span>
                          </li>
                        )}
                        {pageResults.map((e, i) => (
                          <li key={`${e.url}::${e.title}`} role="option" aria-selected={highlighted === i}>
                            <ResultRow entry={e} idx={i} />
                          </li>
                        ))}
                      </>
                    )}

                    {/* Book results */}
                    {bookResults.length > 0 && (
                      <>
                        <li className="px-4 pt-3 pb-1">
                          <span className="text-[10px] uppercase tracking-[0.18em] text-white/25 font-semibold">Books</span>
                        </li>
                        {bookResults.map((e, i) => {
                          const flatIdx = pageResults.length + i;
                          return (
                            <li key={e.url} role="option" aria-selected={highlighted === flatIdx}>
                              <ResultRow entry={e} idx={flatIdx} />
                            </li>
                          );
                        })}
                      </>
                    )}
                  </>
                )}
              </ul>
            ) : (
              /* Empty state — suggestion chips */
              <div className="px-4 py-4">
                <p className="text-[10px] uppercase tracking-[0.18em] text-white/20 mb-3">Quick links</p>
                <div className="grid grid-cols-2 gap-2">
                  {["Audio Demos", "Narrated Works", "Contact", "Working Together"].map(hint => (
                    <button key={hint} type="button" onClick={() => setQuery(hint)}
                      className="text-left text-xs text-white/40 hover:text-white/70 px-3 py-2 rounded-lg border border-white/6 hover:border-white/20 transition-colors">
                      {hint}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="px-4 py-2.5 border-t border-white/6 flex items-center gap-4 text-[10px] text-white/20">
              <span>↑↓ navigate</span>
              <span>↵ select</span>
              <span>Esc close</span>
              {booksLoaded && bookEntries.length > 0 && (
                <span className="ml-auto">{bookEntries.length} books indexed</span>
              )}
            </div>
          </div>
          </div>
        </>
      )}
    </>
  );
}
