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
  statusBadge?: React.ReactNode;
}

// --- Book Card Component ---
function BookCard({ book, statusBadge }: BookCardProps) {
  return (
    <a
      href={book.link}
      target="_blank"
      rel="noopener noreferrer"
      className="
        group relative rounded-xl overflow-hidden shadow-lg 
        hover:shadow-2xl transition-all duration-300 hover:-translate-y-2 
        border border-[#1A2550] bg-[#0B1224] flex-shrink-0 
        w-[75vw] sm:w-64 md:w-72 snap-start select-none
      "
      onDragStart={(e) => e.preventDefault()}
      onClick={(e) => {
        // Only prevent click if we are currently dragging on desktop
        if (window.isGlobalDragging) e.preventDefault();
      }}
    >
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

      {statusBadge && (
        <div className="absolute top-3 right-3 bg-[#D4AF37] text-black text-[10px] font-bold px-2 py-0.5 rounded uppercase z-20">
          {statusBadge}
        </div>
      )}

      {book.note && (
        <div className="absolute top-3 left-3 bg-yellow-600/80 text-white text-[10px] px-2 py-0.5 rounded z-20">
          Note
        </div>
      )}

      <div className="p-4 text-center pointer-events-none">
        <h3 className="font-semibold text-base leading-tight text-white group-hover:text-[#D4AF37] transition-colors">
          {book.title}
        </h3>
        {book.subtitle && (
          <p className="text-sm text-white/75 mt-0.5">{book.subtitle}</p>
        )}
        <p className="text-sm mt-2 text-[#D4AF37] font-medium">
          {book.author}
        </p>
      </div>
    </a>
  );
}

declare global {
  interface Window {
    isGlobalDragging: boolean;
  }
}

interface HorizontalScrollerProps {
  children: React.ReactNode;
  ariaLabel: string;
}

// --- Horizontal Scroller Component ---
function HorizontalScroller({ children, ariaLabel }: HorizontalScrollerProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [showBar, setShowBar] = useState(false);

  const isDown = useRef(false);
  const startX = useRef(0);
  const scrollLeftStart = useRef(0);
  const moved = useRef(false);

  const updateProgress = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setProgress(max > 0 ? (el.scrollLeft / max) * 100 : 0);
  }, []);

  const checkOverflow = useCallback(() => {
    const el = scrollerRef.current;
    if (el) {
      setShowBar(el.scrollWidth > el.clientWidth + 10);
      updateProgress();
    }
  }, [updateProgress]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(checkOverflow);
    ro.observe(el);
    el.addEventListener("scroll", updateProgress, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", updateProgress);
    };
  }, [checkOverflow, updateProgress]);

  // Handle Dragging
  const handlePointerDown = (e: React.PointerEvent, target: 'container' | 'thumb') => {
    // If it's a touch, we let the browser handle native scrolling
    if (e.pointerType === 'touch' && target === 'container') return;

    const el = scrollerRef.current;
    if (!el) return;

    isDown.current = true;
    moved.current = false;
    window.isGlobalDragging = false;
    startX.current = e.pageX;
    scrollLeftStart.current = el.scrollLeft;

    // Desktop/Thumb specific behavior
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    el.style.scrollSnapType = "none";
    el.style.scrollBehavior = "auto";
  };

  const handlePointerMove = (e: React.PointerEvent, target: 'container' | 'thumb') => {
    if (!isDown.current || !scrollerRef.current) return;
    
    const el = scrollerRef.current;
    const x = e.pageX;
    const delta = x - startX.current;

    if (Math.abs(delta) > 10) {
      moved.current = true;
      window.isGlobalDragging = true;
    }

    if (target === 'container') {
      // Drag cards: move left when mouse moves left
      el.scrollLeft = scrollLeftStart.current - delta;
    } else {
      // Drag thumb: move right when mouse moves right
      const maxScroll = el.scrollWidth - el.clientWidth;
      const trackWidth = trackRef.current?.clientWidth || 1;
      const scrollRatio = maxScroll / trackWidth;
      el.scrollLeft = scrollLeftStart.current + (delta * scrollRatio);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    isDown.current = false;
    const el = scrollerRef.current;
    if (el) {
      el.style.scrollSnapType = "x mandatory";
      el.style.scrollBehavior = "smooth";
    }
    setTimeout(() => { window.isGlobalDragging = false; }, 50);
  };

  return (
    <div className="relative group/scroller">
      {/* Gradients */}
      <div className="absolute left-0 top-0 bottom-0 w-8 sm:w-32 bg-gradient-to-r from-[#050814] to-transparent z-10 pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-8 sm:w-32 bg-gradient-to-l from-[#050814] to-transparent z-10 pointer-events-none" />

      <div
        ref={scrollerRef}
        onPointerDown={(e) => handlePointerDown(e, 'container')}
        onPointerMove={(e) => handlePointerMove(e, 'container')}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="
          flex overflow-x-auto pb-10 
          snap-x snap-mandatory 
          scroll-smooth gap-5 sm:gap-8 px-6 sm:px-20
          hide-scrollbar select-none
        "
        style={{ 
          touchAction: "pan-y", 
          WebkitOverflowScrolling: "touch",
        }}
        aria-label={ariaLabel}
      >
        {children}
        <div className="flex-shrink-0 w-6 sm:w-20" />
      </div>

      {showBar && (
        <div className="hidden sm:flex mt-6 justify-center px-4">
          <div className="w-full max-w-md">
            <div
              ref={trackRef}
              className="relative h-2 rounded-full bg-white/5"
            >
              <div
                onPointerDown={(e) => {
                  e.stopPropagation();
                  handlePointerDown(e, 'thumb');
                }}
                onPointerMove={(e) => handlePointerMove(e, 'thumb')}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                className="
                  absolute top-1/2 h-4 w-16 rounded-full bg-[#D4AF37] 
                  cursor-grab active:cursor-grabbing 
                "
                style={{ 
                  left: `${progress}%`, 
                  transform: `translate(-${progress}%, -50%)` 
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function NarratedWorks() {
  const completed: Book[] = [
    { title: "The Final Guardian", subtitle: "The Citadel of the Mind and the Garden", author: "Alexander Kamenetsky", link: "https://www.amazon.com/Final-Guardian-Citadel-Mind-Garden/dp/B0G1CNQM8H", cover: "/covers/the-final-guardian.jpg" },
    { title: "Santa Promised", subtitle: "A Christmas Novella", author: "Laetitia Clark", link: "https://www.amazon.com/Santa-Promised-A-Christmas-Novella/dp/B0G6GLQGHK", cover: "/covers/santa-promised.jpg" },
    { title: "The Circle", subtitle: "Rituals & Ruins", author: "Lilian Monroe, Kayla Gerdes", link: "https://www.amazon.com/Audible-The-Circle-Rituals-Ruins/dp/B0GKQY7N27", cover: "/covers/the-circle-rituals-and-ruins.jpg" },
    { title: "Sultry Secrets: Tease", subtitle: "Sultry Secrets Book 4", author: "Bethanie Loren", link: "https://www.amazon.com/-/es/Bethanie-Loren-ebook/dp/B0G6VDHL9L", cover: "/covers/sultry-secrets-tease.jpg", note: true },
    { title: "Heir of the Emberscale", author: "Shelby Gardner", link: "https://www.amazon.com/Heir-Emberscale-Shelby-Gardner-ebook/dp/B0FXR4Y9JB", cover: "/covers/heir-of-emberscale.jpg" },
  ];

  const inProgress: Book[] = [
    { title: "No One to Hold Me", author: "Noelle Rahn-Johnson", link: "https://www.amazon.com/No-One-Hold-Noelle-Rahn-Johnson-ebook/dp/B088RMPLYX", cover: "/covers/no-one-to-hold-me.jpg" },
    { title: "Merciless Punks", author: "Madeline Fay", link: "https://www.amazon.com/Merciless-Punks-Enemies-romance-douchebags-ebook/dp/B09Z9P3C7V", cover: "/covers/merciless-punks.jpg" },
    { title: "Unmasked Hearts", author: "K.E. Noel", link: "https://www.amazon.com/Unmasked-Hearts-K-Noel-ebook/dp/B0FMKP92Y9", cover: "/covers/unmasked-hearts.jpg" },
  ];

  const comingSoon: Book[] = [
    { title: "Beating For You", author: "L.L. McAlister", link: "https://www.amazon.com/Beating-You-Body-Nobody-That-ebook/dp/B0FNQ2F6P4", cover: "/covers/beating-for-you.jpg" },
    { title: "Whiskey & Lies", author: "E.A. Harper", link: "https://www.amazon.com/dp/B0FBT3XW76", cover: "/covers/whiskey-and-lies.jpg" },
  ];

  return (
    <main className="min-h-screen bg-[#050814] text-white overflow-x-hidden">
      <div className="max-w-7xl mx-auto py-16 md:py-24">
        <header className="mb-16 text-center px-6">
          <h1 className="text-4xl md:text-6xl font-bold mb-4">Narrated Works</h1>
          <p className="text-white/60 text-lg">Your completed and current audiobook projects.</p>
        </header>

        <section className="mb-20">
          <h2 className="text-2xl font-bold mb-8 text-center uppercase tracking-widest text-white/90">Completed Projects</h2>
          <HorizontalScroller ariaLabel="Completed projects">
            {completed.map((book, index) => <BookCard key={index} book={book} />)}
          </HorizontalScroller>
        </section>

        <section className="mb-20">
          <h2 className="text-2xl font-bold mb-8 text-center uppercase tracking-widest text-white/90">Currently Narrating</h2>
          <HorizontalScroller ariaLabel="Currently narrating">
            {inProgress.map((book, index) => (
              <BookCard key={index} book={book} statusBadge="In Progress" />
            ))}
          </HorizontalScroller>
        </section>

        <section className="mb-20">
          <h2 className="text-2xl font-bold mb-8 text-center uppercase tracking-widest text-white/90">Coming Soon</h2>
          <HorizontalScroller ariaLabel="Coming soon">
            {comingSoon.map((book, index) => (
              <BookCard key={index} book={book} statusBadge="Soon" />
            ))}
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