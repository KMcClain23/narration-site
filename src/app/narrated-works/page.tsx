"use client";

import Image from "next/image";
import Link from "next/link";
import React, { useEffect, useRef, useState, useCallback } from "react";

type Book = {
  title: string;
  subtitle?: string;
  author: string;
  link: string;
  cover: string;
  note?: boolean;
};

interface BookCardProps {
  book: Book;
}

// --- Book Card Component ---
function BookCard({ book }: BookCardProps) {
  return (
    <div
      className="
        group relative rounded-xl overflow-hidden shadow-lg 
        transition-all duration-300 hover:-translate-y-2 
        border border-[#1A2550] bg-[#0B1224] flex-shrink-0 
        w-[75vw] sm:w-64 md:w-72 snap-start select-none
      "
    >
      <a
        href={book.link}
        target="_blank"
        rel="noopener noreferrer"
        onPointerDown={(e) => e.stopPropagation()}
        className="
          absolute top-3 left-3 z-30
          bg-[#D4AF37] hover:bg-[#E0C15A] text-black 
          p-2 rounded-full shadow-lg transition-transform 
          active:scale-90 hover:scale-110 cursor-pointer
        "
        style={{ touchAction: "manipulation" }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          <polyline points="15 3 21 3 21 9" />
          <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
      </a>

      <div className="relative aspect-[3/4.5] w-full bg-gray-900/40 pointer-events-none">
        <Image
          src={book.cover}
          alt={`${book.title} book cover`}
          fill
          draggable={false}
          className="object-cover transition-transform duration-500 group-hover:scale-105"
          sizes="(max-width: 640px) 75vw, 288px"
        />
      </div>

      {book.note && (
        <div className="absolute top-[44px] left-3 bg-yellow-600/90 text-white text-[10px] px-2 py-0.5 rounded z-20">
          Note
        </div>
      )}

      <div className="p-4 text-center pointer-events-none">
        <h3 className="font-semibold text-base leading-tight text-white group-hover:text-[#D4AF37] transition-colors">
          {book.title}
        </h3>
        <p className="text-sm mt-2 text-[#D4AF37] font-medium">{book.author}</p>
      </div>
    </div>
  );
}

// --- Swipe Hint Component ---
function SwipeHint() {
  return (
    <div className="sm:hidden absolute right-6 top-1/2 -translate-y-1/2 z-40 pointer-events-none">
      <div className="bg-[#D4AF37] p-3 rounded-full shadow-[0_0_20px_rgba(212,175,55,0.6)] border border-white/20 animate-swipe-hint">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8L22 12L18 16" />
          <path d="M2 12H22" />
        </svg>
      </div>
    </div>
  );
}

interface HorizontalScrollerProps {
  children: React.ReactNode;
  ariaLabel: string;
  showHint?: boolean;
}

function HorizontalScroller({ children, ariaLabel, showHint = false }: HorizontalScrollerProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [showBar, setShowBar] = useState(false);
  const [hintVisible, setHintVisible] = useState(showHint);

  const isDown = useRef(false);
  const startX = useRef(0);
  const scrollLeftStart = useRef(0);

  const updateProgress = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const currentScroll = el.scrollLeft;
    
    setProgress(max > 0 ? (currentScroll / max) * 100 : 0);
    
    // Hide hint once user scrolls even a little bit
    if (currentScroll > 10 && hintVisible) {
      setHintVisible(false);
    }
  }, [hintVisible]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setShowBar(el.scrollWidth > el.clientWidth + 10);
      updateProgress();
    });
    ro.observe(el);
    el.addEventListener("scroll", updateProgress, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", updateProgress);
    };
  }, [updateProgress]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return;
    const el = scrollerRef.current;
    if (!el) return;
    isDown.current = true;
    startX.current = e.pageX;
    scrollLeftStart.current = el.scrollLeft;
    el.setPointerCapture(e.pointerId);
    el.style.scrollSnapType = "none";
    el.style.scrollBehavior = "auto";
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!isDown.current || !scrollerRef.current || e.pointerType === 'touch') return;
    const delta = e.pageX - startX.current;
    scrollerRef.current.scrollLeft = scrollLeftStart.current - delta;
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return;
    isDown.current = false;
    if (scrollerRef.current) {
      scrollerRef.current.style.scrollSnapType = "x mandatory";
      scrollerRef.current.style.scrollBehavior = "smooth";
    }
  };

  return (
    <div className="relative group/scroller overflow-hidden">
      {hintVisible && <SwipeHint />}
      
      <div className="absolute left-0 top-0 bottom-0 w-4 sm:w-32 bg-gradient-to-r from-[#050814] to-transparent z-10 pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-4 sm:w-32 bg-gradient-to-l from-[#050814] to-transparent z-10 pointer-events-none" />

      <div
        ref={scrollerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="
          flex overflow-x-auto pb-10 
          snap-x snap-mandatory 
          scroll-smooth gap-4 sm:gap-8 px-6 sm:px-20
          hide-scrollbar select-none
        "
        style={{ 
          touchAction: "pan-x pan-y", // Allows native scroll on both axes
          WebkitOverflowScrolling: "touch",
          overscrollBehaviorX: 'contain'
        }}
      >
        {children}
        <div className="flex-shrink-0 w-10 sm:w-20" />
      </div>

      {showBar && (
        <div className="hidden sm:flex mt-6 justify-center px-4">
          <div className="w-full max-w-md bg-white/5 h-2 rounded-full relative" ref={trackRef}>
            <div
              className="absolute top-1/2 h-4 w-16 rounded-full bg-[#D4AF37] -translate-y-1/2 cursor-grab shadow-[0_0_10px_rgba(212,175,55,0.3)]"
              style={{ left: `${progress}%`, marginLeft: `-${(progress / 100) * 64}px` }}
            />
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes swipe-hint {
          0%, 100% { transform: translateX(0); opacity: 0.8; }
          50% { transform: translateX(-15px); opacity: 1; }
        }
        .animate-swipe-hint {
          animation: swipe-hint 1.5s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}

export default function NarratedWorks() {
  const completed: Book[] = [
    { title: "The Final Guardian", author: "Alexander Kamenetsky", link: "https://www.amazon.com/Final-Guardian-Citadel-Mind-Garden/dp/B0G1CNQM8H", cover: "/covers/the-final-guardian.jpg" },
    { title: "Santa Promised", author: "Laetitia Clark", link: "https://www.amazon.com/Santa-Promised-A-Christmas-Novella/dp/B0G6GLQGHK", cover: "/covers/santa-promised.jpg" },
    { title: "The Circle", author: "Lillian Minx Monroe", link: "https://www.amazon.com/Audible-The-Circle-Rituals-Ruins/dp/B0GKQY7N27", cover: "/covers/the-circle-rituals-and-ruins.jpg" },
    { title: "Sultry Secrets: Tease", author: "Bethanie Loren", link: "https://www.amazon.com/-/es/Bethanie-Loren-ebook/dp/B0G6VDHL9L", cover: "/covers/sultry-secrets-tease.jpg", note: true },
    { title: "Heir of the Emberscale", author: "Shelby Gardner", link: "https://www.amazon.com/Heir-Emberscale-Shelby-Gardner-ebook/dp/B0FXR4Y9JB", cover: "/covers/heir-of-emberscale.jpg" },
  ];

  const inProgress: Book[] = [
    { title: "No One to Hold Me", author: "Noelle Rahn-Johnson", link: "https://www.amazon.com/No-One-Hold-Noelle-Rahn-Johnson-ebook/dp/B088RMPLYX", cover: "/covers/no-one-to-hold-me.jpg" },
    { title: "Merciless Punks", author: "Madeline Fay", link: "https://www.amazon.com/Merciless-Punks-Enemies-romance-douchebags-ebook/dp/B09Z9P3C7V", cover: "/covers/merciless-punks.jpg" },
  ];

  return (
    <main className="min-h-screen bg-[#050814] text-white">
      <div className="max-w-7xl mx-auto py-16 md:py-24">
        <header className="mb-20 text-center px-6">
          <h1 className="text-4xl md:text-6xl font-bold mb-4">Narrated Works</h1>
          <p className="text-white/60 text-lg">Portfolio of narrated audiobooks.</p>
        </header>

        <section className="mb-20">
          <h2 className="text-2xl font-bold mb-8 text-center uppercase tracking-widest text-white/90">Completed Projects</h2>
          {/* Only the first section gets the hint */}
          <HorizontalScroller ariaLabel="Completed projects" showHint={true}>
            {completed.map((book, index) => <BookCard key={index} book={book} />)}
          </HorizontalScroller>
        </section>

        <section className="mb-20">
          <h2 className="text-2xl font-bold mb-8 text-center uppercase tracking-widest text-white/90">In Progress</h2>
          <HorizontalScroller ariaLabel="Currently narrating">
            {inProgress.map((book, index) => <BookCard key={index} book={book} />)}
          </HorizontalScroller>
        </section>

        <footer className="mt-24 text-center">
          <Link href="/#contact" className="inline-flex items-center justify-center rounded-full bg-[#D4AF37] text-black px-10 py-4 font-bold hover:scale-105 transition-all">
            Contact Me
          </Link>
        </footer>
      </div>
    </main>
  );
}