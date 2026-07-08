"use client";

import Image from "next/image";
import { useState, useRef, useEffect, useCallback } from "react";
import type { ReactNode } from "react";

// ─── shared types ─────────────────────────────────────────────────────────────

export type CoNarratorDetail = { name: string; photo: string | null; bio: string | null };

// ─── avatar helpers ───────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "bg-violet-800", "bg-indigo-800", "bg-sky-800",
  "bg-teal-800",   "bg-rose-900",   "bg-amber-900",
];

function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function getInitials(name: string): string {
  return name.split(/\s+/).map(w => w[0] ?? "").join("").slice(0, 2).toUpperCase();
}

// ─── popup card shell ─────────────────────────────────────────────────────────

function PopupShell({ children }: { children: ReactNode }) {
  return (
    <div
      className="w-64 rounded-xl overflow-hidden"
      style={{
        background: "rgba(8, 12, 60, 0.97)",
        border: "1px solid rgba(100, 120, 255, 0.2)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        boxShadow: "0 16px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)",
      }}
    >
      {children}
    </div>
  );
}

// ─── hover card wrapper ───────────────────────────────────────────────────────
// Shows popup above trigger on desktop hover; toggles on mobile tap.
// Outside click/tap dismisses on mobile.

function HoverCard({ children, popup }: { children: ReactNode; popup: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const hide = () => {
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };

  const dismiss = useCallback((e: MouseEvent | TouchEvent) => {
    if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    document.addEventListener("mousedown", dismiss, true);
    document.addEventListener("touchstart", dismiss, true);
    return () => {
      document.removeEventListener("mousedown", dismiss, true);
      document.removeEventListener("touchstart", dismiss, true);
    };
  }, [open, dismiss]);

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={show}
      onMouseLeave={hide}
      onClick={() => setOpen(v => !v)}
    >
      {children}

      {/* pb-3 bridges the visual gap so onMouseLeave doesn't fire between trigger and popup */}
      <div
        aria-hidden={!open}
        className={`absolute bottom-full left-0 z-50 pb-3 transition-all duration-200 ease-out origin-bottom-left ${
          open
            ? "opacity-100 scale-100 translate-y-0 pointer-events-auto"
            : "opacity-0 scale-95 translate-y-1 pointer-events-none"
        }`}
      >
        <PopupShell>{popup}</PopupShell>
      </div>
    </div>
  );
}

// ─── popup content: author ────────────────────────────────────────────────────

function AuthorPopup({ name, bio }: { name: string; bio: string | null }) {
  return (
    <div className="p-4">
      <p className="text-[10px] uppercase tracking-[0.2em] text-[#D4AF37]/70 font-semibold mb-1.5">
        Author
      </p>
      <p className="text-sm font-bold text-white mb-2">{name}</p>
      {bio ? (
        <p className="text-xs text-white/55 leading-relaxed line-clamp-5">{bio}</p>
      ) : (
        <p className="text-xs text-white/30 italic">No bio available.</p>
      )}
    </div>
  );
}

// ─── popup content: Dean Miller ───────────────────────────────────────────────

const DEAN_BIO =
  "Dean Miller is a professional audiobook narrator with a rich, expressive voice. He specialises in dark romance, romantasy, and thriller — bringing every character to life across a growing catalog of titles.";

function DeanPopup() {
  return (
    <div className="p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="relative h-12 w-12 rounded-full overflow-hidden border border-white/15 shrink-0">
          <Image
            src="/dean-headshot.jpg"
            alt="Dean Miller"
            fill
            className="object-cover object-top"
            sizes="48px"
          />
        </div>
        <div>
          <p className="text-sm font-bold text-white leading-tight">Dean Miller</p>
          <p className="text-[11px] text-[#D4AF37]">Audiobook Narrator</p>
        </div>
      </div>
      <p className="text-xs text-white/55 leading-relaxed">{DEAN_BIO}</p>
    </div>
  );
}

// ─── popup content: co-narrator ───────────────────────────────────────────────

function CoNarratorPopup({ name, photo, bio }: CoNarratorDetail) {
  const color = avatarColor(name);
  const initials = getInitials(name);
  return (
    <div className="p-4">
      <div className="flex items-center gap-3 mb-3">
        <div
          className={`relative h-12 w-12 rounded-full overflow-hidden border border-white/15 shrink-0 flex items-center justify-center ${!photo ? color : ""}`}
        >
          {photo ? (
            <Image src={photo} alt={name} fill className="object-cover" sizes="48px" />
          ) : (
            <span className="text-xs font-bold text-white/80">{initials}</span>
          )}
        </div>
        <div>
          <p className="text-sm font-bold text-white leading-tight">{name}</p>
          <p className="text-[11px] text-[#D4AF37]">Co-Narrator</p>
        </div>
      </div>
      {bio ? (
        <p className="text-xs text-white/55 leading-relaxed line-clamp-5">{bio}</p>
      ) : (
        <p className="text-xs text-white/30 italic">No bio available.</p>
      )}
    </div>
  );
}

// ─── exported: author name with hover popup ───────────────────────────────────
// Replaces the plain <p> for the author name in the book details header.

export function AuthorHoverName({ name, bio }: { name: string; bio: string | null }) {
  return (
    <HoverCard popup={<AuthorPopup name={name} bio={bio} />}>
      <p
        className="text-[#D4AF37] font-semibold text-lg mb-5 cursor-default w-fit"
        itemProp="byArtist"
      >
        {name}
      </p>
    </HoverCard>
  );
}

// ─── exported: full "Narrated by" section ────────────────────────────────────

export function NarratedBySection({
  coNarratorNames,
  coNarratorDetails,
  compact = false,
}: {
  coNarratorNames: string[];
  coNarratorDetails: CoNarratorDetail[];
  compact?: boolean;
}) {
  const avatarSize = compact ? "h-10 w-10" : "h-16 w-16";
  const avatarSizePx = compact ? "40px" : "64px";
  const nameText = compact ? "text-xs" : "text-sm";
  const roleText = compact ? "text-[10px]" : "text-[11px]";
  const rowGap = compact ? "gap-2.5" : "gap-3";
  const wrapGap = compact ? "gap-4" : "gap-5";
  // Multicast (2+ co-narrators) stacks vertically instead of wrapping wide —
  // a horizontal row of many avatars blows out the narrow cover column.
  const isMulticast = compact && coNarratorNames.length > 1;

  return (
    <div className={compact ? "mb-4 flex flex-col items-center" : "mb-8"}>
      <p className={`text-[10px] uppercase tracking-[0.22em] text-white/35 font-semibold mb-3 ${compact ? "text-center" : ""}`}>
        Narrated by
      </p>
      <div className={isMulticast ? "flex flex-col items-center gap-3" : `flex flex-wrap items-center ${compact ? "justify-center" : ""} ${wrapGap}`}>

        {/* Dean Miller */}
        <HoverCard popup={<DeanPopup />}>
          <div className={`flex items-center ${rowGap} cursor-default select-none`}>
            <div className={`relative ${avatarSize} rounded-full overflow-hidden border border-white/15 shrink-0`}>
              <Image
                src="/dean-headshot.jpg"
                alt="Dean Miller"
                fill
                className="object-cover object-top"
                sizes={avatarSizePx}
              />
            </div>
            <div>
              <p className={`${nameText} font-semibold text-white leading-tight`}>Dean Miller</p>
              <p className={`${roleText} text-white/40 leading-tight`}>Narrator</p>
            </div>
          </div>
        </HoverCard>

        {/* Co-narrators */}
        {coNarratorNames.map(name => {
          const detail = coNarratorDetails.find(d => d.name === name) ?? {
            name,
            photo: null,
            bio: null,
          };
          const color = avatarColor(name);
          const initials = getInitials(name);
          return (
            <HoverCard key={name} popup={<CoNarratorPopup {...detail} />}>
              <div className={`flex items-center ${rowGap} cursor-default select-none`}>
                <div
                  className={`relative ${avatarSize} rounded-full overflow-hidden border border-white/15 shrink-0 flex items-center justify-center ${!detail.photo ? color : ""}`}
                >
                  {detail.photo ? (
                    <Image
                      src={detail.photo}
                      alt={name}
                      fill
                      className="object-cover"
                      sizes={avatarSizePx}
                    />
                  ) : (
                    <span className="text-xs font-bold text-white/80">{initials}</span>
                  )}
                </div>
                <div>
                  <p className={`${nameText} font-semibold text-white leading-tight`}>{name}</p>
                  <p className={`${roleText} text-white/40 leading-tight`}>Co-Narrator</p>
                </div>
              </div>
            </HoverCard>
          );
        })}

      </div>
    </div>
  );
}
