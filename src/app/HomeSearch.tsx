"use client";

import { useState, useRef, useEffect, useCallback } from "react";

// ─── search index ─────────────────────────────────────────────────────────────
// Each entry maps a page section id to a display title and searchable keywords.
// Multiple entries can share the same id (they scroll to the same section).

type SearchEntry = { id: string; title: string; keywords: string[] };

const INDEX: SearchEntry[] = [
  {
    id: "demos",
    title: "Audio Demos",
    keywords: [
      "demo", "audio", "listen", "sample", "play", "hear", "narration",
      "voice", "romance", "romantasy", "lgbtq", "duet", "british", "accent",
      "character", "dialogue", "multi-character", "portfolio", "reel",
    ],
  },
  {
    id: "demos",
    title: "Demo Submission Info",
    keywords: [
      "submit", "submission", "audition", "custom demo", "request demo",
      "paid audition", "acx", "sample chapter",
    ],
  },
  {
    id: "testimonials",
    title: "Testimonials & Reviews",
    keywords: [
      "testimonial", "review", "author", "feedback", "quote", "recommendation",
      "clients", "what authors say", "leave a review", "experience",
    ],
  },
  {
    id: "about",
    title: "About Dean Miller",
    keywords: [
      "about", "bio", "background", "narrator", "professional", "experience",
      "specialties", "dark romance", "romantasy", "lgbtq", "thriller", "drama",
      "music", "theatre", "voice range", "who is dean",
    ],
  },
  {
    id: "about",
    title: "Studio & Equipment",
    keywords: [
      "studio", "equipment", "shure", "mv7", "mic", "microphone", "acoustic",
      "treated", "home studio", "broadcast quality", "acx ready", "mastering",
      "production", "recording", "setup", "sound",
    ],
  },
  {
    id: "process",
    title: "What to Expect / Process",
    keywords: [
      "expect", "process", "how it works", "workflow", "steps", "approval",
      "first 15", "first-15", "first fifteen", "milestone", "pickups",
      "character voice list", "communication", "livestream", "timeline",
      "turnaround", "48 hours", "24 hours", "delivery",
    ],
  },
  {
    id: "process",
    title: "Cover Art Requirements",
    keywords: [
      "cover", "cover art", "artwork", "image", "jpeg", "png", "size",
      "resolution", "thumbnail", "audible cover", "acx cover", "guidelines",
      "requirements", "spec", "specifications",
    ],
  },
  {
    id: "about",
    title: "Services & Genres",
    keywords: [
      "service", "genre", "dark romance", "romantasy", "thriller", "drama",
      "lgbtq", "fantasy", "sci-fi", "fiction", "solo", "duet", "co-narrator",
      "multicast", "british", "accent", "what do you narrate",
    ],
  },
  {
    id: "contact",
    title: "Contact & Get a Quote",
    keywords: [
      "contact", "inquiry", "get in touch", "quote", "rate", "price", "cost",
      "pfh", "per finished hour", "hire", "commission", "work together",
      "project details", "budget", "available", "availability", "booking",
    ],
  },
  {
    id: "contact",
    title: "Book a Call",
    keywords: [
      "call", "schedule", "calendar", "book", "meeting", "free call",
      "15 minute", "consultation", "talk", "chat", "phone", "video",
    ],
  },
  {
    id: "contact",
    title: "Direct Email",
    keywords: [
      "email", "direct email", "dean@dmnarration", "message", "reach out",
      "send email", "response time", "reply",
    ],
  },
  {
    id: "contact",
    title: "Social Media & Profiles",
    keywords: [
      "social", "tiktok", "instagram", "acx", "audible", "find me",
      "profile", "follow", "facebook", "twitter",
    ],
  },
  {
    id: "about",
    title: "FAQ",
    keywords: [
      "faq", "frequently asked", "questions", "how long", "how much",
      "do you", "can you", "will you", "what is", "differences",
    ],
  },
];

// ─── pulse animation injected once ────────────────────────────────────────────

let styleInjected = false;
function injectStyle() {
  if (styleInjected || typeof document === "undefined") return;
  styleInjected = true;
  const s = document.createElement("style");
  s.textContent = `
    @keyframes searchPulse {
      0%   { box-shadow: 0 0 0 0   rgba(212,175,55,0.55), 0 0 0 0   rgba(212,175,55,0); }
      40%  { box-shadow: 0 0 0 4px rgba(212,175,55,0.35), 0 0 24px 0 rgba(212,175,55,0.15); }
      100% { box-shadow: 0 0 0 0   rgba(212,175,55,0),    0 0 0 0   rgba(212,175,55,0); }
    }
    .search-pulse {
      animation: searchPulse 1.6s ease forwards;
      border-radius: 16px;
      outline: 2px solid rgba(212,175,55,0.4);
      outline-offset: 4px;
      transition: outline 0.15s;
    }
  `;
  document.head.appendChild(s);
}

// ─── component ────────────────────────────────────────────────────────────────

export function HomeSearch() {
  const [query, setQuery]           = useState("");
  const [open, setOpen]             = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const inputRef    = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { injectStyle(); }, []);

  // Filter + deduplicate
  const results: SearchEntry[] = (() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const seen = new Set<string>();
    return INDEX.filter(entry => {
      const key = `${entry.id}::${entry.title}`;
      if (seen.has(key)) return false;
      const hit =
        entry.title.toLowerCase().includes(q) ||
        entry.keywords.some(k => k.toLowerCase().includes(q));
      if (hit) seen.add(key);
      return hit;
    });
  })();

  const scrollTo = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.classList.remove("search-pulse");
    // Force reflow so the animation restarts cleanly
    void el.offsetWidth;
    el.classList.add("search-pulse");
    setTimeout(() => el.classList.remove("search-pulse"), 1700);
  }, []);

  const pick = useCallback((entry: SearchEntry) => {
    setQuery("");
    setOpen(false);
    setHighlighted(-1);
    scrollTo(entry.id);
  }, [scrollTo]);

  // Outside-click dismiss
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setHighlighted(-1);
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted(h => (results.length ? Math.min(h + 1, results.length - 1) : -1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted(h => Math.max(h - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlighted >= 0 && results[highlighted]) pick(results[highlighted]);
      else if (results.length === 1) pick(results[0]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setHighlighted(-1);
    }
  };

  const noResults = query.trim().length >= 2 && results.length === 0;
  const showDrop  = open && query.trim().length > 0 && (results.length > 0 || noResults);

  return (
    <div ref={containerRef} className="relative w-full max-w-sm mx-auto">
      {/* Input */}
      <div className={`flex items-center gap-3 rounded-full border px-4 py-2.5 transition-all duration-200 ${
        open && query
          ? "border-[#D4AF37]/40 bg-[#0A0D3A] shadow-lg shadow-[#D4AF37]/5"
          : "border-white/10 bg-white/[0.04] hover:border-white/20"
      }`}>
        <svg className="h-3.5 w-3.5 text-white/30 shrink-0" fill="none" viewBox="0 0 24 24"
          stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
        </svg>
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={showDrop}
          aria-haspopup="listbox"
          aria-label="Search page sections"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); setHighlighted(-1); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search this page…"
          className="flex-1 bg-transparent text-sm text-white placeholder:text-white/25 focus:outline-none"
        />
        {query && (
          <button type="button" aria-label="Clear"
            onClick={() => { setQuery(""); setOpen(false); inputRef.current?.focus(); }}
            className="text-white/25 hover:text-white/60 transition-colors">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        )}
      </div>

      {/* Dropdown */}
      {showDrop && (
        <div
          role="listbox"
          className="absolute top-full left-0 right-0 mt-2 rounded-2xl border border-white/10 overflow-hidden z-50"
          style={{
            background: "rgba(8,12,60,0.98)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            boxShadow: "0 24px 64px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)",
          }}
        >
          {noResults ? (
            <div className="px-4 py-4 text-sm text-white/40 leading-relaxed">
              No results —{" "}
              <button type="button"
                onClick={() => { setQuery(""); setOpen(false); scrollTo("contact"); }}
                className="text-[#D4AF37] hover:underline underline-offset-2">
                Contact
              </button>
              {" "}for anything else
            </div>
          ) : (
            results.map((entry, i) => (
              <button
                key={`${entry.id}::${entry.title}`}
                type="button"
                role="option"
                aria-selected={highlighted === i}
                onMouseEnter={() => setHighlighted(i)}
                onClick={() => pick(entry)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-white/[0.05] last:border-0 transition-colors ${
                  highlighted === i
                    ? "bg-[#D4AF37]/12 text-white"
                    : "text-white/65 hover:bg-white/[0.04] hover:text-white"
                }`}
              >
                {/* Chevron down = "scroll to" */}
                <svg className={`h-3.5 w-3.5 shrink-0 transition-colors ${highlighted === i ? "text-[#D4AF37]" : "text-white/20"}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
                </svg>
                <span className="text-sm font-medium">{entry.title}</span>
                <span className="ml-auto text-[10px] text-white/20 tracking-wide shrink-0">↓ jump</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
