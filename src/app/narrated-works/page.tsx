"use client";

import Image from "next/image";
import Link from "next/link";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Book } from "@/types/book";

function makeSlug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

interface CoNarrator {
  id: string;
  name: string;
  bio: string;
  website: string;
  amazon: string;
  instagram: string;
  tiktok: string;
  facebook: string;
  goodreads: string;
}

interface Author {
  id: string;
  name: string;
  bio: string;
  website: string;
  amazon: string;
  instagram: string;
  tiktok: string;
  facebook: string;
  goodreads: string;
}

function AuthorLink({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-white/80 hover:text-white hover:bg-white/8 transition-colors group"
    >
      <span className="text-[#D4AF37] w-4 h-4 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
        {icon}
      </span>
      <span>{label}</span>
      <svg className="ml-auto h-3 w-3 text-white/20 group-hover:text-white/50 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
      </svg>
    </a>
  );
}

function AuthorPopup({
  author,
  anchorRef,
  onClose,
  label = "Author",
}: {
  author: Author;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  label?: string;
}) {
  const popupRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({ opacity: 0, pointerEvents: "none" });

  // Position popup — render offscreen first, measure, then place correctly
  useEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;

    const margin = 10;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const isMobile = vw < 640;

    if (isMobile) {
      setStyle({
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        width: "100%",
        zIndex: 9999,
        opacity: 1,
        pointerEvents: "auto",
        maxHeight: vh * 0.65,
        borderRadius: "1rem 1rem 0 0",
        transformOrigin: "bottom center",
      });
      return;
    }

    // Step 1: render offscreen to measure actual height
    setStyle({
      position: "fixed",
      top: -9999,
      left: -9999,
      width: 272,
      zIndex: 9999,
      opacity: 0,
      pointerEvents: "none",
    });

    // Step 2: after render, measure and reposition
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const popup = popupRef.current;
        if (!popup) return;

        const rect = anchor.getBoundingClientRect();
        const popupWidth = 272;
        const popupHeight = popup.scrollHeight;

        let left = rect.left;
        if (left + popupWidth > vw - margin) left = rect.right - popupWidth;
        left = Math.max(margin, Math.min(left, vw - popupWidth - margin));

        const spaceBelow = vh - rect.bottom - margin - 6;
        const spaceAbove = rect.top - margin - 6;

        let top: number;
        let maxHeight: number;
        let flipY = false;

        if (popupHeight <= spaceBelow) {
          // Fits below — no clipping needed
          top = rect.bottom + 6;
          maxHeight = spaceBelow;
        } else if (spaceAbove > spaceBelow) {
          // More room above — flip
          flipY = true;
          maxHeight = spaceAbove;
          top = rect.top - 6 - Math.min(popupHeight, maxHeight);
          top = Math.max(margin, top);
        } else {
          // Not enough room either way — show below with scroll
          top = rect.bottom + 6;
          maxHeight = spaceBelow;
        }

        const anchorCX = rect.left + rect.width / 2;
        const originX = anchorCX - left;
        const originY = flipY ? Math.min(popupHeight, maxHeight) : 0;

        setStyle({
          position: "fixed",
          top,
          left,
          width: popupWidth,
          zIndex: 9999,
          opacity: 1,
          pointerEvents: "auto",
          transformOrigin: `${originX}px ${originY}px`,
          maxHeight: Math.max(maxHeight, 150),
          animation: "liquidReveal 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
        });
      });
    });
  }, [anchorRef]);

  // Close on outside click or Escape
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        popupRef.current &&
        !popupRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose, anchorRef]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const hasAnyLink = author.website || author.amazon || author.instagram || author.tiktok || author.facebook || author.goodreads;

  const popup = (
    <div
      ref={popupRef}
      role="dialog"
      aria-label={`${author.name} author info`}
      className="rounded-2xl border border-[#1A2070] bg-[#0A0D3A] shadow-2xl flex flex-col"
      style={{ ...style, animation: style.opacity === 1 ? "liquidReveal 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards" : undefined, maxHeight: "calc(100vh - 24px)", overflow: "hidden" }}
    >
      {/* Mobile drag handle */}
      <div className="sm:hidden flex justify-center pt-2 pb-1 shrink-0">
        <div className="h-1 w-10 rounded-full bg-white/20" />
      </div>
      {/* Header — fixed */}
      <div className="flex items-center justify-between gap-3 px-4 pt-2 sm:pt-4 pb-3 border-b border-white/8 shrink-0">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#D4AF37] font-semibold">{label}</p>
          <p className="mt-0.5 font-semibold text-white text-sm leading-tight">{author.name}</p>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1.5 text-white/30 hover:text-white hover:bg-white/8 transition-colors"
          aria-label="Close"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Bio */}
      {author.bio && (
        <p className="px-4 pt-3 pb-1 text-xs text-white/60 leading-relaxed">{author.bio}</p>
      )}

      {/* Links */}
      {hasAnyLink ? (
        <div className="px-2 py-2">
          <AuthorLink href={author.website} label="Website" icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
          } />
          <AuthorLink href={author.amazon} label="Amazon author page" icon={
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M13.958 10.09c0 1.232.029 2.256-.591 3.351-.502.891-1.301 1.438-2.186 1.438-1.214 0-1.922-.924-1.922-2.292 0-2.692 2.415-3.182 4.699-3.182v.685zm3.186 7.705c-.209.189-.512.201-.745.074-1.047-.872-1.236-1.276-1.814-2.106-1.734 1.767-2.962 2.297-5.209 2.297-2.66 0-4.731-1.641-4.731-4.925 0-2.565 1.391-4.309 3.37-5.164 1.715-.754 4.11-.891 5.942-1.095v-.41c0-.753.06-1.642-.383-2.294-.385-.579-1.124-.818-1.775-.818-1.205 0-2.277.618-2.54 1.898-.054.285-.261.567-.549.582l-3.061-.333c-.259-.056-.548-.266-.472-.66C5.57 2.857 8.393 2 10.936 2c1.302 0 3.003.346 4.029 1.33C16.261 4.567 16.15 6.2 16.15 7.986v4.807c0 1.446.6 2.08 1.164 2.862.2.279.243.615-.01.824l-2.16 1.316zm3.617 1.66C18.573 21.34 15.953 22 14.498 22c-1.894 0-4.044-.765-5.496-2.01-.214-.18-.024-.428.233-.287 1.565.912 3.503 1.462 5.502 1.462 1.35 0 2.836-.28 4.2-.859.207-.087.38.135.224.33z"/></svg>
          } />
          <AuthorLink href={author.goodreads} label="Goodreads" icon={
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M11.43 23.995c-3.608-.208-6.274-2.077-6.448-5.078.695.007 1.375-.013 2.07-.006.224 1.342 1.065 2.43 2.515 3.002 1.905.756 4.217.496 5.567-.98.955-1.03 1.36-2.716 1.29-4.436l-.002-1.97h-.064c-1.023 1.77-2.845 2.495-4.8 2.356-4.146-.32-6.268-3.988-6.268-7.632 0-3.783 2.396-7.602 6.833-7.602 1.575 0 3.145.45 4.315 1.97h.064V1.49h2.067v16.452c0 5.704-2.735 6.262-6.505 6.053zm.22-21.03c-2.948 0-4.718 2.268-4.718 5.42 0 2.99 1.608 5.55 4.73 5.55 1.403 0 2.67-.452 3.56-1.658.89-1.207 1.118-2.787 1.118-4.244 0-1.36-.23-2.796-1.09-3.915-.87-1.12-2.14-1.153-3.6-1.153z"/></svg>
          } />
          <AuthorLink href={author.instagram} label="Instagram" icon={
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
          } />
          <AuthorLink href={author.tiktok} label="TikTok" icon={
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.16 8.16 0 004.77 1.52V6.76a4.85 4.85 0 01-1-.07z"/></svg>
          } />
          <AuthorLink href={author.facebook} label="Facebook" icon={
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
          } />
        </div>
      ) : (
        <p className="px-4 py-4 text-xs text-white/35 italic">No links available yet.</p>
      )}
    </div>
  );

  return mounted ? createPortal(popup, document.body) : null;
}

function BookCard({ book, statusBadge, author, onTagClick, coNarrators }: { book: Book; statusBadge?: React.ReactNode; author?: Author; onTagClick: (tag: string) => void; coNarrators: Record<string, CoNarrator> }) {
  const hasLink = Boolean(book.link?.trim());
  const [showAuthorPopup, setShowAuthorPopup] = useState(false);
  const authorBtnRef = useRef<HTMLButtonElement>(null);
  const coNarratorBtnRef = useRef<HTMLButtonElement>(null);
  const [showCoNarratorPopup, setShowCoNarratorPopup] = useState(false);
  const [activeCoNarrator, setActiveCoNarrator] = useState<string>("");
  const [showMulticast, setShowMulticast] = useState(false);
  const coNarratorList = (() => {
    const raw = book.co_narrator;
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.filter(Boolean);
    if (typeof raw === "string") {
      // Handle JSON-stringified arrays like '["Ann Dahlia"]'
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.filter(Boolean);
        return parsed ? [parsed] : [];
      } catch {
        return raw ? [raw] : [];
      }
    }
    return [];
  })();

  const bookSlug = makeSlug(book.title);
  return (
    <div
      className="group relative rounded-2xl overflow-visible cursor-pointer"
      itemScope
      itemType="https://schema.org/Book"
      style={{ aspectRatio: "2/3" }}
    >
      {/* Cover wrapper — also the primary navigation link for the card */}
      <Link href={`/narrated-works/${bookSlug}`} className="absolute inset-0 block rounded-2xl overflow-hidden">
        <Image
          src={book.cover_url}
          alt={`${book.title} audiobook narrated by Dean Miller`}
          fill
          className="object-cover transition-transform duration-700 group-hover:scale-110"
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 280px"
          itemProp="image"
        />

        {/* Ambient glow */}
        <div className="absolute -inset-2 opacity-0 group-hover:opacity-30 transition-opacity duration-700 blur-2xl bg-[#D4AF37] pointer-events-none z-0" />

        {/* Hover overlay — tags only, top portion */}
        <div
          className="absolute inset-0 z-20 opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col p-3 sm:p-4"
          style={{ background: "linear-gradient(to bottom, rgba(6,8,46,0.85) 0%, rgba(6,8,46,0.1) 40%, transparent 100%)" }}
        >
          {/* Tags — decorative pills */}
          <div className="flex flex-wrap gap-2">
            {book.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="text-[10px] font-bold uppercase tracking-wide text-white bg-[#D4AF37]/30 border border-[#D4AF37]/60 px-2 py-0.5 rounded-full backdrop-blur-sm"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* Status badge — sits in a bottom gradient overlay */}
        {statusBadge && (
          <div className="absolute inset-x-0 bottom-0 z-30 flex items-end justify-end pb-2.5 px-2.5"
            style={{ background: "linear-gradient(to top, rgba(6,8,46,0.85) 0%, rgba(6,8,46,0) 55%)" }}>
            <span className="bg-[#D4AF37] text-black text-[8px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
              {statusBadge}
            </span>
          </div>
        )}
      </Link>

      {/* Floating pill — compact default, expands on hover.
          pointer-events-none in compact so clicks fall through to the cover Link;
          pointer-events-auto on hover so expanded buttons work. */}
      <div className="absolute bottom-0 inset-x-0 z-30 pointer-events-none group-hover:pointer-events-auto">
        {/* Invisible anchor for popup positioning — always present */}
        <button
          ref={authorBtnRef}
          type="button"
          className="absolute opacity-0 pointer-events-none w-0 h-0"
          aria-hidden="true"
          tabIndex={-1}
        />
        <div
          className="rounded-xl transition-all duration-300"
          style={{
            background: "rgba(8, 12, 60, 0.97)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            border: "1px solid rgba(100, 120, 255, 0.25)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
          }}
        >
          {/* Default (compact) state */}
          <div className="block group-hover:hidden px-3 py-2.5 sm:px-4 sm:py-3 pointer-events-none">
            <h3 className="font-semibold text-xs sm:text-sm leading-snug text-white truncate" itemProp="name">
              {book.title}
            </h3>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setShowAuthorPopup((v) => !v); }}
              className="text-[10px] sm:text-xs text-[#D4AF37] font-medium hover:text-[#F0D060] transition-colors text-left block truncate w-full"
              itemProp="author"
              aria-label={`View ${book.author} author info`}
            >
              {book.author}
            </button>
            {coNarratorList.length === 1 && (
              <div className="flex items-center gap-1 mt-0.5">
                <span className="text-[9px] text-white/30 uppercase tracking-wide">with</span>
                <button type="button"
                  onClick={(e) => { e.stopPropagation(); setActiveCoNarrator(coNarratorList[0]); setShowCoNarratorPopup(true); }}
                  className="text-[10px] sm:text-xs text-[#D4AF37]/70 font-medium hover:text-[#D4AF37] transition-colors text-left truncate"
                >
                  {coNarratorList[0]}
                </button>
              </div>
            )}
            {coNarratorList.length > 1 && (
              <span className="inline-block mt-0.5 text-[9px] font-bold uppercase tracking-wide text-[#D4AF37]/70 border border-[#D4AF37]/30 bg-[#D4AF37]/10 px-1.5 py-0.5 rounded-full">
                Multicast
              </span>
            )}
          </div>
          {/* Expanded (hover) state */}
          <div className="hidden group-hover:block px-3 py-4 sm:px-5 sm:py-5">
            <Link
              href={`/narrated-works/${bookSlug}`}
              className="font-bold text-base sm:text-xl leading-snug text-white hover:text-[#D4AF37] transition-colors block"
              itemProp="name"
            >
              {book.title}
            </Link>
            {book.subtitle && (
              <p className="text-xs sm:text-sm text-white mt-1 sm:mt-1.5 leading-snug font-medium">{book.subtitle}</p>
            )}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setShowAuthorPopup((v) => !v); }}
              className="mt-1.5 sm:mt-2 text-sm sm:text-base text-[#D4AF37] font-bold hover:text-[#F0D060] transition-colors text-left hover:underline underline-offset-2 block"
              itemProp="author"
              aria-label={`View ${book.author} author info`}
            >
              {book.author}
            </button>
            {coNarratorList.length === 1 && (
              <div className="flex items-center gap-1.5 mt-1.5">
                <span className="text-xs text-white/30 uppercase tracking-wide">with</span>
                <button
                  ref={coNarratorBtnRef}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setActiveCoNarrator(coNarratorList[0]); setShowCoNarratorPopup(true); }}
                  className="text-sm text-[#D4AF37]/80 font-semibold hover:text-[#D4AF37] transition-colors text-left hover:underline underline-offset-2"
                >
                  {coNarratorList[0]}
                </button>
              </div>
            )}
            {coNarratorList.length > 1 && (
              <div className="mt-2 relative">
                <button
                  ref={coNarratorBtnRef}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setShowMulticast(v => !v); }}
                  className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[#D4AF37] border border-[#D4AF37]/40 bg-[#D4AF37]/10 px-2.5 py-1 rounded-full hover:bg-[#D4AF37]/20 transition-colors"
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Multicast
                  <svg className={`h-3 w-3 transition-transform ${showMulticast ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {showMulticast && (
                  <div className="absolute bottom-full left-0 right-0 mb-2 rounded-xl border border-[#D4AF37]/25 bg-[#0A0D3A] shadow-xl p-3 space-y-1 max-h-40 overflow-y-auto">
                    {coNarratorList.map((name) => (
                      <button key={name} type="button"
                        onClick={(e) => { e.stopPropagation(); setActiveCoNarrator(name); setShowCoNarratorPopup(true); setShowMulticast(false); }}
                        className="flex items-center gap-1.5 text-sm text-[#D4AF37]/80 font-semibold hover:text-[#D4AF37] transition-colors hover:underline underline-offset-2 w-full text-left"
                      >
                        <span className="h-1 w-1 rounded-full bg-[#D4AF37]/50 shrink-0" />
                        {name}
                      </button>
                    ))}
                  </div>
                )}
                {/* Audible after multicast */}
                {hasLink && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); window.open(book.link, "_blank", "noopener,noreferrer"); }}
                    className="mt-3 self-start inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-black bg-[#D4AF37] hover:bg-[#E0C15A] px-3 py-2 sm:px-4 sm:py-2 rounded-full transition-colors shadow-lg"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v13.72l11-6.86L8 5.14z" /></svg>
                    Listen on Audible
                  </button>
                )}
              </div>
            )}
            {/* Audible for no co-narrator or single co-narrator */}
            {coNarratorList.length <= 1 && hasLink && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); window.open(book.link, "_blank", "noopener,noreferrer"); }}
                className="mt-3 self-start inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-black bg-[#D4AF37] hover:bg-[#E0C15A] px-3 py-2 sm:px-4 sm:py-2 rounded-full transition-colors shadow-lg"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v13.72l11-6.86L8 5.14z" /></svg>
                Listen on Audible
              </button>
            )}
            {/* Explicit "View details" CTA */}
            <Link
              href={`/narrated-works/${bookSlug}`}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-white/60 border border-white/20 px-3 py-1.5 rounded-full hover:border-white/50 hover:text-white transition-colors"
            >
              View details
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
              </svg>
            </Link>
          </div>
        </div>
      </div>

      {/* Author popup — outside the overflow:hidden wrapper */}
      {showAuthorPopup && author && (
        <AuthorPopup
          author={author}
          anchorRef={authorBtnRef}
          onClose={() => setShowAuthorPopup(false)}
        />
      )}

      {/* Co-narrator popup */}
      {showCoNarratorPopup && activeCoNarrator && coNarrators[activeCoNarrator] && (
        <AuthorPopup
          author={{ ...coNarrators[activeCoNarrator], __type: "narrator" } as Author}
          anchorRef={coNarratorBtnRef}
          onClose={() => setShowCoNarratorPopup(false)}
          label="Co-narrator"
        />
      )}
    </div>
  );
}

function SectionGrid({
  title, books, statusBadge, authors, onTagClick, coNarrators, dotClass,
}: {
  title: string; books: Book[]; statusBadge?: React.ReactNode;
  authors: Record<string, Author>; onTagClick: (tag: string) => void;
  coNarrators: Record<string, CoNarrator>; dotClass?: string;
}) {
  if (books.length === 0) return null;
  return (
    <section className="mb-10">
      <div className="flex items-center gap-3 mb-5 scroll-mt-28 sm:scroll-mt-36">
        {dotClass && <div className={`h-2 w-2 rounded-full shrink-0 ${dotClass}`}/>}
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-white/60">{title}</h2>
        <div className="flex-1 h-px bg-white/8" />
        <span className="text-xs text-white/40">{books.length}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6 items-start" style={{ paddingBottom: "1rem" }}>
        {books.map((book) => (
          <BookCard key={book.id} book={book} statusBadge={statusBadge} author={authors[book.author]} onTagClick={onTagClick} coNarrators={coNarrators} />
        ))}
      </div>
    </section>
  );
}

export default function NarratedWorks() {
  const [books, setBooks] = useState<Book[]>([]);
  const [authors, setAuthors] = useState<Record<string, Author>>({});
  const [coNarrators, setCoNarrators] = useState<Record<string, CoNarrator>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        setFetchError(null);
        const [booksRes, authorsRes, coNarratorsRes] = await Promise.all([
          fetch("/api/books"),
          fetch("/api/authors"),
          fetch("/api/co-narrators"),
        ]);
        const booksData = await booksRes.json();
        const authorsData = await authorsRes.json();
        const coNarratorsData = await coNarratorsRes.json();
        if (booksRes.ok) {
          setBooks(booksData.books || []);
        } else {
          const msg = booksData.details || booksData.error || `HTTP ${booksRes.status}`;
          console.error("Failed to load books:", msg, booksData);
          setFetchError(msg);
        }
        if (authorsRes.ok) {
          const map: Record<string, Author> = {};
          for (const a of authorsData.authors || []) map[a.name] = a;
          setAuthors(map);
        }
        if (coNarratorsRes.ok) {
          const map: Record<string, CoNarrator> = {};
          for (const n of coNarratorsData.co_narrators || []) map[n.name] = n;
          setCoNarrators(map);
        }
      } catch (error) {
        console.error("Narrated works fetch error:", error);
        setFetchError(error instanceof Error ? error.message : "Failed to load");
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  const completed  = useMemo(() => books.filter((b) => b.category === "completed"),   [books]);
  const inProgress = useMemo(() => books.filter((b) => b.category === "in-progress"), [books]);
  const comingSoon = useMemo(() => books.filter((b) => b.category === "coming-soon"), [books]);
  const totalBooks = completed.length + inProgress.length + comingSoon.length;

  return (
    <main className="min-h-screen bg-[#06082E] text-white overflow-x-clip">
      <div className="max-w-7xl mx-auto px-5 sm:px-8 pt-0 pb-12">

        {/* Page title — sticky */}
        <div className="sticky top-14 sm:top-16 z-40 -mx-5 sm:-mx-8 px-5 sm:px-8 py-2 sm:py-3 mb-4 sm:mb-6"
          style={{ background: "rgba(6,8,46,0.94)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-white/40 mb-1">Portfolio</p>
              <h1 className="text-lg sm:text-2xl font-bold text-white leading-none">Narrated works</h1>
              {!isLoading && totalBooks > 0 && (
                <p className="mt-1 text-xs text-white/35 hidden sm:block">{totalBooks} titles across dark romance, romantasy, thriller & more</p>
              )}
            </div>
            <Link
              href="/#contact"
              className="inline-flex items-center justify-center rounded-full bg-[#D4AF37] text-black px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-[#E0C15A] transition whitespace-nowrap shrink-0"
            >
              Request a quote
            </Link>
          </div>
        </div>{/* end sticky */}

        {isLoading ? (
          <div className="space-y-10">
            {[6, 4].map((count, si) => (
              <div key={si}>
                <div className="flex items-center gap-4 mb-5">
                  <div className="h-2.5 w-20 bg-white/8 rounded animate-pulse" />
                  <div className="flex-1 h-px bg-white/5" />
                  <div className="h-2.5 w-4 bg-white/6 rounded animate-pulse" />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
                  {Array.from({ length: count }).map((_, i) => (
                    <div key={i} className="animate-pulse" style={{ aspectRatio: "2/3" }}>
                      <div className="w-full h-full rounded-2xl bg-white/[0.07]" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : fetchError ? (
          <div className="py-32 text-center">
            <p className="text-white/40 text-sm mb-2">Failed to load books</p>
            <p className="text-white/20 text-xs font-mono">{fetchError}</p>
          </div>
        ) : (
          <>
            <SectionGrid title="Completed" books={completed} authors={authors} onTagClick={() => {}} coNarrators={coNarrators} dotClass="bg-emerald-400" />
            <SectionGrid title="Currently narrating" books={inProgress} statusBadge="In Progress" authors={authors} onTagClick={() => {}} coNarrators={coNarrators} dotClass="bg-yellow-400" />
            <SectionGrid title="Coming soon" books={comingSoon} statusBadge="Soon" authors={authors} onTagClick={() => {}} coNarrators={coNarrators} dotClass="bg-blue-400" />
          </>
        )}

        <div className="border-t border-white/5 pt-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-white/35 text-sm">Working on your next audiobook?</p>
          <div className="flex gap-3">
            <Link href="/#contact" className="inline-flex items-center justify-center rounded-md bg-[#D4AF37] text-black px-6 py-2.5 text-sm font-semibold hover:bg-[#E0C15A] transition">Get in touch</Link>
            <Link href="/#demos" className="inline-flex items-center justify-center rounded-md border border-white/15 px-6 py-2.5 text-sm font-semibold text-white/70 hover:border-white/40 hover:text-white transition">Listen to demos</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
