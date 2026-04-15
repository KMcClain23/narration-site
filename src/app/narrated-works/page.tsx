"use client";

import Image from "next/image";
import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Book } from "@/types/book";

interface BookCardProps {
  book: Book;
  statusBadge?: React.ReactNode;
}

function BookCard({ book, statusBadge }: BookCardProps) {
  const hasLink = Boolean(book.link?.trim());

  return (
    <div
      className="group relative rounded-xl overflow-hidden shadow-lg transition-all duration-300 hover:-translate-y-2 border border-[#1A2550] bg-[#0B1224] flex-shrink-0 w-[75vw] sm:w-64 md:w-72 snap-start select-none"
      itemScope
      itemType="https://schema.org/Book"
    >
      {hasLink && (
        <div className="absolute top-3 left-3 z-50 group/btn">
          <a
            href={book.link}
            target="_blank"
            rel="noopener noreferrer"
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className="block bg-[#D4AF37] hover:bg-[#E0C15A] text-black p-2 rounded-full shadow-lg transition-transform active:scale-90 hover:scale-110 cursor-pointer"
            style={{ touchAction: "manipulation" }}
            aria-label={`View ${book.title} on Amazon`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
        </div>
      )}

      <div className="relative aspect-[3/4.5] w-full bg-gray-900/40 overflow-hidden">
        <Image
          src={book.cover_url}
          alt={`${book.title} cover`}
          fill
          draggable={false}
          className="object-cover transition-transform duration-700 group-hover:scale-110"
          sizes="(max-width: 640px) 75vw, 288px"
        />

        <div className="absolute inset-0 bg-black/85 backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all duration-500 flex flex-col items-center justify-center p-6 z-40 text-center pointer-events-none">
          <p className="text-[#D4AF37] text-[10px] font-bold uppercase tracking-widest mb-3 border-b border-[#D4AF37]/30 pb-1">
            Synopsis
          </p>
          <p className="text-white/95 text-xs leading-relaxed italic line-clamp-[14]">
            {book.description || "Full description available on Amazon."}
          </p>
          <div className="mt-4 w-8 h-0.5 bg-[#D4AF37] rounded-full" />
        </div>
      </div>

      {statusBadge && (
        <div className="absolute top-3 right-3 bg-[#D4AF37] text-black text-[10px] font-bold px-2 py-0.5 rounded uppercase z-20">
          {statusBadge}
        </div>
      )}

      <div className="p-4 pb-2 text-center">
        <h3
          className="font-semibold text-base leading-tight text-white group-hover:text-[#D4AF37] transition-colors line-clamp-1"
          itemProp="name"
        >
          {book.title}
        </h3>

        {book.subtitle && (
          <p className="text-xs text-white/75 mt-0.5 line-clamp-1">
            {book.subtitle}
          </p>
        )}

        <p className="text-sm mt-1 text-[#D4AF37] font-medium" itemProp="author">
          {book.author}
        </p>

        <div className="mt-3 flex flex-wrap justify-center gap-1">
          {book.tags.map((tag) => (
            <span
              key={tag}
              className="bg-black/80 backdrop-blur-sm text-[#D4AF37] text-[9px] font-bold px-2 py-0.5 rounded border border-[#D4AF37]/40 uppercase tracking-tight shadow-sm whitespace-nowrap"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function HorizontalScroller({
  children,
  ariaLabel,
}: {
  children: React.ReactNode;
  ariaLabel: string;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [showBar, setShowBar] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const isDown = useRef(false);
  const startX = useRef(0);
  const scrollLeftStart = useRef(0);

  const updateScrollState = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;

    const max = el.scrollWidth - el.clientWidth;
    const scrollPercent = max > 0 ? el.scrollLeft / max : 0;

    setProgress(scrollPercent * 100);
    setCanScrollLeft(el.scrollLeft > 5);
    setCanScrollRight(el.scrollLeft < max - 5);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    el.scrollTo({ left: 0 });

    const ro = new ResizeObserver(() => {
      setShowBar(el.scrollWidth > el.clientWidth + 10);
      updateScrollState();
    });

    ro.observe(el);
    el.addEventListener("scroll", updateScrollState, { passive: true });

    updateScrollState();

    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", updateScrollState);
    };
  }, [updateScrollState]);

  const scroll = (direction: "left" | "right") => {
    const el = scrollerRef.current;
    if (!el) return;

    const scrollAmount = el.clientWidth * 0.8;

    el.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "touch") return;

    const el = scrollerRef.current;
    if (!el) return;

    isDown.current = true;
    startX.current = e.pageX;
    scrollLeftStart.current = el.scrollLeft;

    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    el.style.scrollSnapType = "none";
    el.style.scrollBehavior = "auto";
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!isDown.current || !scrollerRef.current) return;

    const el = scrollerRef.current;
    const delta = e.pageX - startX.current;
    el.scrollLeft = scrollLeftStart.current - delta;
  };

  const onPointerUp = () => {
    isDown.current = false;

    if (scrollerRef.current) {
      scrollerRef.current.style.scrollSnapType = "x mandatory";
      scrollerRef.current.style.scrollBehavior = "smooth";
    }
  };

  return (
    <div className="relative group/scroller">
      {canScrollLeft && (
        <button
          onClick={() => scroll("left")}
          className="hidden sm:flex absolute left-4 top-1/2 -translate-y-1/2 z-40 bg-black/60 border border-[#D4AF37]/30 text-[#D4AF37] p-3 rounded-full backdrop-blur-md transition-all duration-300 hover:scale-110 hover:bg-black/80 hover:border-[#D4AF37] active:scale-95 opacity-0 group-hover/scroller:opacity-100 shadow-2xl"
          aria-label="Scroll left"
          type="button"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      )}

      {canScrollRight && (
        <button
          onClick={() => scroll("right")}
          className="hidden sm:flex absolute right-4 top-1/2 -translate-y-1/2 z-40 bg-black/60 border border-[#D4AF37]/30 text-[#D4AF37] p-3 rounded-full backdrop-blur-md transition-all duration-300 hover:scale-110 hover:bg-black/80 hover:border-[#D4AF37] active:scale-95 opacity-0 group-hover/scroller:opacity-100 shadow-2xl"
          aria-label="Scroll right"
          type="button"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      )}

      <div className="absolute left-0 top-0 bottom-0 w-4 sm:w-32 bg-gradient-to-r from-[#050814] to-transparent z-10 pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-4 sm:w-32 bg-gradient-to-l from-[#050814] to-transparent z-10 pointer-events-none" />

      <div
        ref={scrollerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          touchAction: "auto",
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none",
        }}
        aria-label={ariaLabel}
        className="flex overflow-x-auto pb-10 snap-x snap-mandatory scroll-smooth gap-4 sm:gap-8 px-6 sm:px-20 hide-scrollbar select-none md:cursor-grab md:active:cursor-grabbing justify-start"
      >
        {children}
        <div className="flex-shrink-0 w-10 sm:w-20" />
      </div>

      {showBar && (
        <div className="hidden sm:flex mt-6 justify-center px-4">
          <div className="w-full max-w-md relative h-1.5 rounded-full bg-white/5">
            <div
              className="absolute top-0 bottom-0 w-16 rounded-full bg-[#D4AF37] transition-all duration-75"
              style={{
                left: `${progress}%`,
                transform: `translateX(calc(-${progress}% * (64 / 448)))`,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function NarratedWorks() {
  const [searchQuery, setSearchQuery] = useState("");
  const [books, setBooks] = useState<Book[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadBooks = async () => {
      try {
        setIsLoading(true);

        const response = await fetch("/api/books");
        const result = await response.json();

        if (!response.ok) {
          console.error(result.error || "Failed to load books.");
          return;
        }

        setBooks(result.books || []);
      } catch (error) {
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    };

    loadBooks();
  }, []);

  const completed = useMemo(
    () => books.filter((book) => book.category === "completed"),
    [books]
  );

  const inProgress = useMemo(
    () => books.filter((book) => book.category === "in-progress"),
    [books]
  );

  const comingSoon = useMemo(
    () => books.filter((book) => book.category === "coming-soon"),
    [books]
  );

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

  const hasResults =
    filteredCompleted.length > 0 ||
    filteredInProgress.length > 0 ||
    filteredComingSoon.length > 0;

  return (
    <main className="min-h-screen bg-[#050814] text-white overflow-x-hidden">
      <h1 className="sr-only">Dean Miller Audiobook Narrator Portfolio – Narrated Works</h1>

      <div className="w-full max-w-[1600px] mx-auto py-16 md:py-24">
        <header className="mb-12 text-center px-6 max-w-4xl mx-auto">
          <h2 className="text-4xl md:text-6xl font-bold mb-4">Narrated Works</h2>
          <p className="text-white/60 text-lg max-w-2xl mx-auto">
            Explore my portfolio of professional audiobook narrations.
            Specializing in dark romance, romantasy, and emotionally driven fiction available on Amazon and Audible.
          </p>

          <div className="mt-10 max-w-md mx-auto relative group">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <svg
                className="h-5 w-5 text-white/30 transition-colors"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>

            <input
              type="text"
              placeholder="Search by title, subtitle, author, or genre..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#0B1224] border border-[#1A2550] rounded-full py-3 pl-12 pr-4 text-sm focus:outline-none focus:border-[#D4AF37]/50 focus:ring-1 focus:ring-[#D4AF37]/50 transition-all placeholder:text-white/20"
            />
          </div>
        </header>

        {isLoading ? (
          <div className="py-20 text-center">
            <p className="text-white/40 italic">Loading audiobooks...</p>
          </div>
        ) : !hasResults ? (
          <div className="py-20 text-center">
            <p className="text-white/40 italic">
              No audiobooks found matching "{searchQuery}"
            </p>
            <button
              onClick={() => setSearchQuery("")}
              className="mt-4 text-[#D4AF37] text-sm hover:underline"
              type="button"
            >
              Clear search
            </button>
          </div>
        ) : (
          <>
            {filteredCompleted.length > 0 && (
              <section className="mb-20">
                <h2 className="text-2xl font-bold mb-6 px-6 sm:px-20 text-left uppercase tracking-widest text-white/90">
                  Completed Audiobook Projects
                </h2>
                <HorizontalScroller ariaLabel="Completed projects">
                  {filteredCompleted.map((book) => (
                    <BookCard key={book.id} book={book} />
                  ))}
                </HorizontalScroller>
              </section>
            )}

            {filteredInProgress.length > 0 && (
              <section className="mb-20">
                <h2 className="text-2xl font-bold mb-6 px-6 sm:px-20 text-left uppercase tracking-widest text-white/90">
                  Currently Narrating
                </h2>
                <HorizontalScroller ariaLabel="Currently narrating">
                  {filteredInProgress.map((book) => (
                    <BookCard key={book.id} book={book} statusBadge="In Progress" />
                  ))}
                </HorizontalScroller>
              </section>
            )}

            {filteredComingSoon.length > 0 && (
              <section className="mb-20">
                <h2 className="text-2xl font-bold mb-6 px-6 sm:px-20 text-left uppercase tracking-widest text-white/90">
                  Coming Soon to Audible
                </h2>
                <HorizontalScroller ariaLabel="Coming soon">
                  {filteredComingSoon.map((book) => (
                    <BookCard key={book.id} book={book} statusBadge="Soon" />
                  ))}
                </HorizontalScroller>
              </section>
            )}
          </>
        )}

        <footer className="mt-24 text-center max-w-4xl mx-auto px-6">
          <p className="mb-8 text-white/50 text-sm italic">
            Looking for a specific tone or character range for your next project?
          </p>
          <Link
            href="/#contact"
            className="inline-flex items-center justify-center rounded-full bg-[#D4AF37] text-black px-10 py-4 font-bold hover:scale-105 transition-all"
          >
            Request a Custom Narration Quote
          </Link>
        </footer>
      </div>
    </main>
  );
}