"use client";

import Image from "next/image";
import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Book } from "@/types/book";

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
}: {
  author: Author;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}) {
  const popupRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({ opacity: 0, pointerEvents: "none" });

  // Position using fixed coords — anchored to click point, always in viewport
  useEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;

    const rect = anchor.getBoundingClientRect();
    const popupWidth = 272;
    const margin = 10;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const estimatedHeight = 300;

    // Anchor origin: centre of the button
    const anchorCX = rect.left + rect.width / 2;
    const anchorCY = rect.top + rect.height / 2;

    let left = rect.left;
    let top = rect.bottom + 6;
    let flipY = false;

    if (left + popupWidth > vw - margin) left = rect.right - popupWidth;
    left = Math.max(margin, left);

    if (top + estimatedHeight > vh - margin) {
      top = rect.top - estimatedHeight - 6;
      flipY = true;
    }
    top = Math.max(margin, top);

    // Transform-origin relative to the popup's own top-left corner
    const originX = anchorCX - left;
    const originY = flipY ? estimatedHeight : 0;

    setStyle({
      position: "fixed",
      top,
      left,
      width: popupWidth,
      zIndex: 9999,
      opacity: 1,
      pointerEvents: "auto",
      transformOrigin: `${originX}px ${originY}px`,
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
      className="rounded-2xl border border-[#1A2550] bg-[#0B1224] shadow-2xl overflow-hidden"
      style={{ ...style, animation: style.opacity === 1 ? "liquidReveal 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards" : undefined }}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-3 border-b border-white/8">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#D4AF37] font-semibold">Author</p>
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

function BookCard({ book, statusBadge, author, onTagClick }: { book: Book; statusBadge?: React.ReactNode; author?: Author; onTagClick: (tag: string) => void }) {
  const hasLink = Boolean(book.link?.trim());
  const [showAuthorPopup, setShowAuthorPopup] = useState(false);
  const authorBtnRef = useRef<HTMLButtonElement>(null);

  return (
    <div
      className="group relative rounded-2xl overflow-visible cursor-default"
      itemScope
      itemType="https://schema.org/Book"
      style={{ aspectRatio: "2/3", marginBottom: "8rem" }}
    >
      {/* Cover wrapper — clip to card shape */}
      <div className="absolute inset-0 rounded-2xl overflow-hidden">
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

        {/* Hover overlay — full card face */}
        <div
          className="absolute inset-0 z-20 opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col p-4"
          style={{ background: "linear-gradient(to bottom, rgba(5,8,20,0.85) 0%, rgba(5,8,20,0.1) 40%, rgba(5,8,20,0.1) 60%, rgba(5,8,20,0.0) 100%)" }}
        >
          {/* Tags — top, clickable to filter */}
          <div className="flex flex-wrap gap-2">
            {book.tags.slice(0, 3).map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={(e) => { e.stopPropagation(); onTagClick(tag); }}
                className="text-sm font-bold uppercase tracking-wide text-white bg-[#D4AF37]/30 border border-[#D4AF37]/60 px-3 py-1.5 rounded-full backdrop-blur-sm hover:bg-[#D4AF37]/50 hover:border-[#D4AF37] transition-colors cursor-pointer"
              >
                {tag}
              </button>
            ))}
          </div>
          {/* Listen on Audible — centred */}
          {hasLink && (
            <div className="flex-1 flex items-center justify-center">
              <a
                href={book.link}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-2 text-sm font-bold text-black bg-[#D4AF37] hover:bg-[#E0C15A] px-5 py-2.5 rounded-full transition-colors shadow-xl"
                aria-label={`Listen to ${book.title} on Audible`}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v13.72l11-6.86L8 5.14z" /></svg>
                Listen on Audible
              </a>
            </div>
          )}
        </div>

        {/* Status badge */}
        {statusBadge && (
          <div className="absolute top-3 right-3 z-30 bg-[#D4AF37] text-black text-[8px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
            {statusBadge}
          </div>
        )}
      </div>

      {/* Floating pill — sits over the bottom edge of the card */}
      <div className="absolute -bottom-px inset-x-0 z-30 translate-y-1/2 group-hover:-translate-y-0 transition-transform duration-300">
        <div
          className="rounded-xl px-5 py-5"
          style={{
            background: "rgba(5, 8, 20, 0.97)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            border: "1px solid rgba(255,255,255,0.09)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
          }}
        >
          <h3
            className="font-bold text-lg leading-snug text-white"
            itemProp="name"
          >
            {book.title}
          </h3>
          {book.subtitle && (
            <p className="text-sm text-white/80 mt-1 leading-snug">{book.subtitle}</p>
          )}
          <button
            ref={authorBtnRef}
            type="button"
            onClick={(e) => { e.stopPropagation(); setShowAuthorPopup((v) => !v); }}
            className="mt-2 text-base text-[#E0C15A] font-bold hover:text-[#F0D060] transition-colors text-left hover:underline underline-offset-2 block"
            itemProp="author"
            aria-label={`View ${book.author} author info`}
          >
            {book.author}
          </button>
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
    </div>
  );
}

function SectionGrid({
  title,
  books,
  statusBadge,
  authors,
  onTagClick,
}: {
  title: string;
  books: Book[];
  statusBadge?: React.ReactNode;
  authors: Record<string, Author>;
  onTagClick: (tag: string) => void;
}) {
  if (books.length === 0) return null;
  return (
    <section className="mb-20">
      <div className="flex items-center gap-4 mb-7">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-white/40">{title}</h2>
        <div className="flex-1 h-px bg-white/8" />
        <span className="text-xs text-white/25">{books.length}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6 sm:gap-8 items-start" style={{ paddingBottom: "2rem" }}>
        {books.map((book) => (
          <BookCard key={book.id} book={book} statusBadge={statusBadge} author={authors[book.author]} onTagClick={onTagClick} />
        ))}
      </div>
    </section>
  );
}

export default function NarratedWorks() {
  const [searchQuery, setSearchQuery] = useState("");
  const [books, setBooks] = useState<Book[]>([]);
  const [authors, setAuthors] = useState<Record<string, Author>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        const [booksRes, authorsRes] = await Promise.all([
          fetch("/api/books"),
          fetch("/api/authors"),
        ]);
        const booksData = await booksRes.json();
        const authorsData = await authorsRes.json();
        if (booksRes.ok) setBooks(booksData.books || []);
        if (authorsRes.ok) {
          const map: Record<string, Author> = {};
          for (const a of authorsData.authors || []) map[a.name] = a;
          setAuthors(map);
        }
      } catch (error) {
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  const completed = useMemo(() => books.filter((b) => b.category === "completed"), [books]);
  const inProgress = useMemo(() => books.filter((b) => b.category === "in-progress"), [books]);
  const comingSoon = useMemo(() => books.filter((b) => b.category === "coming-soon"), [books]);

  const filterBooks = useCallback(
    (items: Book[]) => {
      if (!searchQuery.trim()) return items;
      const q = searchQuery.toLowerCase();
      return items.filter(
        (b) =>
          b.title.toLowerCase().includes(q) ||
          (b.subtitle?.toLowerCase().includes(q) ?? false) ||
          b.author.toLowerCase().includes(q) ||
          b.tags.some((t) => t.toLowerCase().includes(q))
      );
    },
    [searchQuery]
  );

  const filteredCompleted = useMemo(() => filterBooks(completed), [completed, filterBooks]);
  const filteredInProgress = useMemo(() => filterBooks(inProgress), [inProgress, filterBooks]);
  const filteredComingSoon = useMemo(() => filterBooks(comingSoon), [comingSoon, filterBooks]);
  const hasResults = filteredCompleted.length > 0 || filteredInProgress.length > 0 || filteredComingSoon.length > 0;
  const totalBooks = completed.length + inProgress.length + comingSoon.length;

  return (
    <main className="min-h-screen bg-[#050814] text-white overflow-x-clip">
      <div className="max-w-7xl mx-auto px-5 sm:px-8 pt-8 pb-20">

        {/* Page title + search — sticky */}
        <div className="sticky top-20 z-40 -mx-5 sm:-mx-8 px-5 sm:px-8 py-4 mb-10"
          style={{ background: "rgba(5,8,20,0.94)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>

          {/* Title + search row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-white/40 mb-1">Portfolio</p>
              <h1 className="text-2xl font-bold text-white leading-none">Narrated works</h1>
              {!isLoading && totalBooks > 0 && (
                <p className="mt-1 text-xs text-white/35">{totalBooks} titles across dark romance, romantasy, thriller & more</p>
              )}
            </div>
            <div className="relative sm:w-72">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-3.5 w-3.5 text-white/25" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                placeholder="Title, author, or genre…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg py-2.5 pl-9 pr-9 text-sm focus:outline-none focus:border-[#D4AF37]/40 focus:bg-white/8 transition-all placeholder:text-white/20 text-white/80"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="absolute inset-y-0 right-0 pr-3 flex items-center text-white/25 hover:text-white/60 transition" type="button" aria-label="Clear search">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              )}
            </div>
          </div>

          {/* Active tag filter indicator */}
          {searchQuery && (
            <div className="flex items-center gap-3 pt-3">
              <span className="text-sm text-white/40">Filtering by:</span>
              <span className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-white bg-[#D4AF37]/20 border border-[#D4AF37]/40 px-3 py-1.5 rounded-full">
                {searchQuery}
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="text-white/50 hover:text-white transition-colors ml-1"
                  aria-label="Clear filter"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            </div>
          )}

        </div>{/* end sticky */}

        {isLoading ? (
          <div className="py-32 text-center">
            <div className="inline-block h-6 w-6 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !hasResults ? (
          <div className="py-32 text-center">
            <p className="text-white/30">No results for &ldquo;{searchQuery}&rdquo;</p>
            <button onClick={() => setSearchQuery("")} className="mt-3 text-[#D4AF37] text-sm hover:underline" type="button">Clear search</button>
          </div>
        ) : (
          <>
            <SectionGrid title="Completed" books={filteredCompleted} authors={authors} onTagClick={setSearchQuery} />
            <SectionGrid title="Currently narrating" books={filteredInProgress} statusBadge="In Progress" authors={authors} onTagClick={setSearchQuery} />
            <SectionGrid title="Coming soon" books={filteredComingSoon} statusBadge="Soon" authors={authors} onTagClick={setSearchQuery} />
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
