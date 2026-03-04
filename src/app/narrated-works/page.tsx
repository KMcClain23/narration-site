"use client";

import Image from "next/image";
import Link from "next/link";
import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";

type Book = {
  title: string;
  subtitle?: string;
  author: string;
  link: string;
  cover: string;
  note?: boolean;
  tags: string[];
};

interface BookCardProps {
  book: Book;
  statusBadge?: React.ReactNode;
}

// --- Book Card Component ---
function BookCard({ book, statusBadge }: BookCardProps) {
  return (
    <div className="group relative rounded-xl overflow-hidden shadow-lg transition-all duration-300 hover:-translate-y-2 border border-[#1A2550] bg-[#0B1224] flex-shrink-0 w-[75vw] sm:w-64 md:w-72 snap-start select-none">
      {/* Amazon Link */}
      <div className="absolute top-3 left-3 z-30 group/btn">
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
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </a>
      </div>

      {/* Book Cover */}
      <div className="relative aspect-[3/4.5] w-full bg-gray-900/40 pointer-events-none">
        <Image
          src={book.cover}
          alt={`${book.title} cover`}
          fill
          draggable={false}
          className="object-cover transition-transform duration-500 group-hover:scale-105"
          sizes="(max-width: 640px) 75vw, 288px"
        />
      </div>

      {statusBadge && (
        <div className="absolute top-3 right-3 bg-[#D4AF37] text-black text-[10px] font-bold px-2 py-0.5 rounded uppercase z-20">
          {statusBadge}
        </div>
      )}

      {/* Details Container */}
      <div className="p-4 pb-2 text-center">
        <h3 className="font-semibold text-base leading-tight text-white group-hover:text-[#D4AF37] transition-colors line-clamp-1">
          {book.title}
        </h3>
        {book.subtitle && <p className="text-xs text-white/75 mt-0.5 line-clamp-1">{book.subtitle}</p>}
        <p className="text-sm mt-1 text-[#D4AF37] font-medium">{book.author}</p>

        {/* Tags */}
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

// --- Horizontal Scroller Component ---
function HorizontalScroller({ children, ariaLabel }: { children: React.ReactNode; ariaLabel: string }) {
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
    setProgress(max > 0 ? (el.scrollLeft / max) * 100 : 0);
    
    // Updates arrow visibility based on scroll position
    setCanScrollLeft(el.scrollLeft > 5);
    setCanScrollRight(el.scrollLeft < max - 5);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    // FIX: Force reset to absolute zero on mount to prevent the initial offset
    el.scrollTo({ left: 0 });

    const ro = new ResizeObserver(() => {
      setShowBar(el.scrollWidth > el.clientWidth + 10);
      updateScrollState();
    });
    ro.observe(el);
    el.addEventListener("scroll", updateScrollState, { passive: true });
    
    // Initial check to hide the left arrow immediately
    updateScrollState();

    return () => { 
      ro.disconnect(); 
      el.removeEventListener("scroll", updateScrollState); 
    };
  }, [updateScrollState]);

  const scroll = (direction: 'left' | 'right') => {
    const el = scrollerRef.current;
    if (!el) return;
    const scrollAmount = el.clientWidth * 0.8;
    el.scrollBy({ 
      left: direction === 'left' ? -scrollAmount : scrollAmount, 
      behavior: 'smooth' 
    });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return;
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
      {/* Navigation Arrows */}
      {canScrollLeft && (
        <button
          onClick={() => scroll('left')}
          className="hidden sm:flex absolute left-4 top-1/2 -translate-y-1/2 z-40 bg-black/60 border border-[#D4AF37]/30 text-[#D4AF37] p-3 rounded-full backdrop-blur-md transition-all duration-300 hover:scale-110 hover:bg-black/80 hover:border-[#D4AF37] active:scale-95 opacity-0 group-hover/scroller:opacity-100 shadow-2xl"
          aria-label="Scroll left"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      )}

      {canScrollRight && (
        <button
          onClick={() => scroll('right')}
          className="hidden sm:flex absolute right-4 top-1/2 -translate-y-1/2 z-40 bg-black/60 border border-[#D4AF37]/30 text-[#D4AF37] p-3 rounded-full backdrop-blur-md transition-all duration-300 hover:scale-110 hover:bg-black/80 hover:border-[#D4AF37] active:scale-95 opacity-0 group-hover/scroller:opacity-100 shadow-2xl"
          aria-label="Scroll right"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
          scrollbarWidth: 'none'
        }}
        aria-label={ariaLabel}
        className="flex overflow-x-auto pb-10 snap-x snap-mandatory scroll-smooth gap-4 sm:gap-8 px-6 sm:px-20 hide-scrollbar select-none md:cursor-grab md:active:cursor-grabbing justify-start"
      >
        {children}
        <div className="flex-shrink-0 w-10 sm:w-20" />
      </div>

      {showBar && (
        <div className="hidden sm:flex mt-6 justify-center px-4">
          <div className="w-full max-w-md relative h-1.5 rounded-full bg-white/5 overflow-hidden">
            <div
              className="absolute top-0 bottom-0 w-16 rounded-full bg-[#D4AF37] transition-all duration-75"
              style={{ 
                left: `${progress}%`, 
                transform: `translateX(-${progress}%)` 
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

  const completed: Book[] = [
    { title: "The Final Guardian", author: "Alexander Kamenetsky", link: "https://www.amazon.com/Final-Guardian-Citadel-Mind-Garden/dp/B0G1CNQM8H", cover: "/covers/the-final-guardian.jpg", tags: ["Sci-Fi Mystery", "Psych Thriller", "AI Horror", "Dystopian"] },
    { title: "Santa Promised", author: "Laetitia Clark", link: "https://www.amazon.com/Santa-Promised-A-Christmas-Novella/dp/B0G6GLQGHK", cover: "/covers/santa-promised.jpg", tags: ["Duet", "Holiday Romance", "Age Gap", "Single Mom"] },
    { title: "The Circle", subtitle: "Rituals & Ruins", author: "Lillian Minx Monroe", link: "https://www.amazon.com/Audible-The-Circle-Rituals-Ruins/dp/B0GKQY7N27", cover: "/covers/the-circle-rituals-and-ruins.jpg", tags: ["Dark Romance", "Mystery", "Small Town", "Secrets"] },
    { title: "Sultry Secrets: Tease", author: "Bethanie Loren", link: "https://www.amazon.com/-/es/Bethanie-Loren-ebook/dp/B0G6VDHL9L", cover: "/covers/sultry-secrets-tease.jpg", tags: ["LGBTQ+", "Friends to Lovers", "Spicy", "Contemporary"] },
    { title: "Heir of the Emberscale", author: "Shelby Gardner", link: "https://www.amazon.com/Heir-Emberscale-Shelby-Gardner-ebook/dp/B0FXR4Y9JB", cover: "/covers/heir-of-emberscale.jpg", tags: ["Fantasy Romance", "Epic", "War & Love", "Dragon Lore"] },
  ];

  const inProgress: Book[] = [
    { title: "No One to Hold Me", author: "Noelle Rahn-Johnson", link: "https://www.amazon.com/No-One-Hold-Noelle-Rahn-Johnson-ebook/dp/B088RMPLYX", cover: "/covers/no-one-to-hold-me.jpg", tags: ["Steamy Romance", "Emotional", "POV Narratives", "Contemporary"] },
    { title: "Merciless Punks", author: "Madeline Fay", link: "https://www.amazon.com/Merciless-Punks-Enemies-romance-douchebags-ebook/dp/B09Z9P3C7V", cover: "/covers/merciless-punks.jpg", tags: ["Dark Romance", "Bully", "Why Choose", "MC Club"] },
    { title: "Unmasked Hearts", author: "K.E. Noel", link: "https://www.amazon.com/Unmasked-Hearts-K-Noel-ebook/dp/B0FMKP92Y9", cover: "/covers/unmasked-hearts.jpg", tags: ["Dual POV", "Contemporary", "Emotional", "Small Town"] },
  ];

  const comingSoon: Book[] = [
    { title: "Beating For You", author: "L.L. McAlister", link: "https://www.amazon.com/Beating-You-Body-Nobody-That-ebook/dp/B0FNQ2F6P4", cover: "/covers/beating-for-you.jpg", tags: ["New Adult", "Steamy Romance", "Emotional", "Dual POV"] },
    { title: "Whiskey & Lies", author: "E.A. Harper", link: "https://www.amazon.com/dp/B0FBT3XW76", cover: "/covers/whiskey-and-lies.jpg", tags: ["Dark Romance", "Romantic Suspense", "Billionaire", "Slow Burn"] },
  ];

  const filterBooks = (books: Book[]) => {
    if (!searchQuery) return books;
    const q = searchQuery.toLowerCase();
    return books.filter(b => b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q) || b.tags.some(t => t.toLowerCase().includes(q)));
  };

  const filteredCompleted = useMemo(() => filterBooks(completed), [searchQuery]);
  const filteredInProgress = useMemo(() => filterBooks(inProgress), [searchQuery]);
  const filteredComingSoon = useMemo(() => filterBooks(comingSoon), [searchQuery]);

  const hasResults = filteredCompleted.length > 0 || filteredInProgress.length > 0 || filteredComingSoon.length > 0;

  return (
    <main className="min-h-screen bg-[#050814] text-white overflow-x-hidden">
      <div className="max-w-7xl mx-auto py-16 md:py-24">
        <header className="mb-12 text-center px-6">
          <h1 className="text-4xl md:text-6xl font-bold mb-4">Narrated Works</h1>
          <p className="text-white/60 text-lg">Portfolio of narrated audiobooks.</p>
          <div className="mt-10 max-w-md mx-auto relative group">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <svg className="h-5 w-5 text-white/30 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input 
              type="text" 
              placeholder="Search by title, author, or genre..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#0B1224] border border-[#1A2550] rounded-full py-3 pl-12 pr-4 text-sm focus:outline-none focus:border-[#D4AF37]/50 focus:ring-1 focus:ring-[#D4AF37]/50 transition-all placeholder:text-white/20"
            />
          </div>
        </header>

        {!hasResults ? (
          <div className="py-20 text-center">
            <p className="text-white/40 italic">No audiobooks found matching "{searchQuery}"</p>
            <button onClick={() => setSearchQuery("")} className="mt-4 text-[#D4AF37] text-sm hover:underline">Clear search</button>
          </div>
        ) : (
          <>
            {filteredCompleted.length > 0 && (
              <section className="mb-20">
                <h2 className="text-2xl font-bold mb-8 text-center uppercase tracking-widest text-white/90">Completed Projects</h2>
                <HorizontalScroller ariaLabel="Completed projects">
                  {filteredCompleted.map((book) => <BookCard key={book.link} book={book} />)}
                </HorizontalScroller>
              </section>
            )}
            {filteredInProgress.length > 0 && (
              <section className="mb-20">
                <h2 className="text-2xl font-bold mb-8 text-center uppercase tracking-widest text-white/90">Currently Narrating</h2>
                <HorizontalScroller ariaLabel="Currently narrating">
                  {filteredInProgress.map((book) => <BookCard key={book.link} book={book} statusBadge="In Progress" />)}
                </HorizontalScroller>
              </section>
            )}
            {filteredComingSoon.length > 0 && (
              <section className="mb-20">
                <h2 className="text-2xl font-bold mb-8 text-center uppercase tracking-widest text-white/90">Coming Soon</h2>
                <HorizontalScroller ariaLabel="Coming soon">
                  {filteredComingSoon.map((book) => <BookCard key={book.link} book={book} statusBadge="Soon" />)}
                </HorizontalScroller>
              </section>
            )}
          </>
        )}
        <footer className="mt-24 text-center">
          <Link href="/#contact" className="inline-flex items-center justify-center rounded-full bg-[#D4AF37] text-black px-10 py-4 font-bold hover:scale-105 transition-all">Contact Me</Link>
        </footer>
      </div>
    </main>
  );
}