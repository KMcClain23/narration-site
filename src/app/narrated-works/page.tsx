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

function BookCard({ book, statusBadge }: BookCardProps) {
  return (
    <a
      href={book.link}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`View ${book.title} by ${book.author} on Amazon`}
      // Added select-none and draggable={false} to prevent browser image ghosting
      className="
        group relative rounded-xl overflow-hidden shadow-lg 
        hover:shadow-2xl transition-all duration-300 hover:-translate-y-2 
        border border-[#1A2550] bg-[#0B1224] flex-shrink-0 
        w-56 sm:w-64 snap-start select-none
      "
      onClick={(e) => {
        // This is a safety check in case the global intercept fails
        if (window.isDragging) e.preventDefault();
      }}
    >
      <div className="relative aspect-[3/4.5] w-full bg-gray-900/40 pointer-events-none">
        <Image
          src={book.cover}
          alt={`${book.title} book cover`}
          fill
          draggable={false}
          className="object-cover transition-transform duration-500 group-hover:scale-105"
          sizes="(max-width: 640px) 70vw, 256px"
        />
      </div>

      {statusBadge && (
        <div className="absolute top-3 right-3 bg-opacity-90 text-xs font-semibold px-2.5 py-1 rounded pointer-events-none">
          {statusBadge}
        </div>
      )}

      {book.note && (
        <div className="absolute top-3 left-3 bg-yellow-600/80 text-white text-xs px-2 py-1 rounded pointer-events-none">
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

// Global declaration to help component communication
declare global {
  interface Window {
    isDragging: boolean;
  }
}

interface HorizontalScrollerProps {
  children: React.ReactNode;
  ariaLabel: string;
}

function HorizontalScroller({ children, ariaLabel }: HorizontalScrollerProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [showBar, setShowBar] = useState(false);

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

  // Unified Drag Logic
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    let isDown = false;
    let startX: number;
    let scrollLeft: number;
    let hasMoved = false;

    const onMouseDown = (e: PointerEvent) => {
      isDown = true;
      hasMoved = false;
      window.isDragging = false;
      startX = e.pageX - el.offsetLeft;
      scrollLeft = el.scrollLeft;
      
      // Stop any current smooth scrolling for immediate response
      el.style.scrollBehavior = 'auto';
      el.style.cursor = 'grabbing';
      el.setPointerCapture(e.pointerId);
    };

    const onMouseMove = (e: PointerEvent) => {
      if (!isDown) return;
      e.preventDefault();
      
      const x = e.pageX - el.offsetLeft;
      const walk = (x - startX) * 1.5; // Scroll speed multiplier
      
      if (Math.abs(walk) > 5) {
        hasMoved = true;
        window.isDragging = true;
      }
      
      el.scrollLeft = scrollLeft - walk;
    };

    const onMouseUp = (e: PointerEvent) => {
      if (!isDown) return;
      isDown = false;
      el.style.scrollBehavior = 'smooth';
      el.style.cursor = 'grab';
      
      // If we moved, we block the very next click event
      if (hasMoved) {
        const preventClick = (e: MouseEvent) => {
          e.preventDefault();
          e.stopImmediatePropagation();
        };
        document.addEventListener('click', preventClick, { capture: true, once: true });
        // Cleanup dragging state after a tiny delay
        setTimeout(() => { window.isDragging = false; }, 50);
      }
    };

    el.addEventListener('pointerdown', onMouseDown);
    el.addEventListener('pointermove', onMouseMove);
    el.addEventListener('pointerup', onMouseUp);
    el.addEventListener('pointercancel', onMouseUp);

    return () => {
      el.removeEventListener('pointerdown', onMouseDown);
      el.removeEventListener('pointermove', onMouseMove);
      el.removeEventListener('pointerup', onMouseUp);
      el.removeEventListener('pointercancel', onMouseUp);
    };
  }, []);

  return (
    <div className="relative group/scroller">
      {/* Gradients */}
      <div className="absolute left-0 top-0 bottom-0 w-12 sm:w-20 bg-gradient-to-r from-[#050814] to-transparent z-10 pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-12 sm:w-20 bg-gradient-to-l from-[#050814] to-transparent z-10 pointer-events-none" />

      <div
        ref={scrollerRef}
        className="
          flex overflow-x-auto pb-8 sm:pb-10 
          snap-x snap-mandatory scroll-smooth gap-5 sm:gap-7 px-8 sm:px-12
          hide-scrollbar cursor-grab active:cursor-grabbing
        "
        style={{ touchAction: "pan-y" }}
        aria-label={ariaLabel}
      >
        {children}
        {/* Spacer for the end of scroll */}
        <div className="flex-shrink-0 w-4 sm:w-8" />
      </div>

      {showBar && (
        <div className="mt-2 flex justify-center px-4">
          <div className="w-full max-w-[200px] sm:max-w-md">
            <div className="relative h-1.5 sm:h-2 rounded-full bg-white/10 overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-[#D4AF37] transition-all duration-150 ease-out"
                style={{ 
                  width: '30%', 
                  transform: `translateX(${(progress * (100 - 30)) / 30}%)` 
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
  // Data arrays remain the same...
  const completed: Book[] = [
    {
      title: "The Final Guardian",
      subtitle: "The Citadel of the Mind and the Garden",
      author: "Alexander Kamenetsky",
      link: "https://www.amazon.com/Final-Guardian-Citadel-Mind-Garden/dp/B0G1CNQM8H",
      cover: "/covers/the-final-guardian.jpg",
    },
    {
      title: "Santa Promised",
      subtitle: "A Christmas Novella",
      author: "Laetitia Clark",
      link: "https://www.amazon.com/Santa-Promised-A-Christmas-Novella/dp/B0G6GLQGHK",
      cover: "/covers/santa-promised.jpg",
    },
    {
      title: "The Circle",
      subtitle: "Rituals & Ruins",
      author: "Lilian Monroe, Kayla Gerdes",
      link: "https://www.amazon.com/Audible-The-Circle-Rituals-Ruins/dp/B0GKQY7N27",
      cover: "/covers/the-circle-rituals-and-ruins.jpg",
    },
    {
      title: "Sultry Secrets: Tease",
      subtitle: "Sultry Secrets Book 4",
      author: "Bethanie Loren",
      link: "https://www.amazon.com/-/es/Bethanie-Loren-ebook/dp/B0G6VDHL9L",
      cover: "/covers/sultry-secrets-tease.jpg",
      note: true,
    },
    {
      title: "Heir of the Emberscale",
      author: "Shelby Gardner",
      link: "https://www.amazon.com/Heir-Emberscale-Shelby-Gardner-ebook/dp/B0FXR4Y9JB",
      cover: "/covers/heir-of-emberscale.jpg",
    },
  ];

  const inProgress: Book[] = [
    {
      title: "No One to Hold Me",
      author: "Noelle Rahn-Johnson",
      link: "https://www.amazon.com/No-One-Hold-Noelle-Rahn-Johnson-ebook/dp/B088RMPLYX",
      cover: "/covers/no-one-to-hold-me.jpg",
    },
    {
      title: "Merciless Punks",
      author: "Madeline Fay",
      link: "https://www.amazon.com/Merciless-Punks-Enemies-romance-douchebags-ebook/dp/B09Z9P3C7V",
      cover: "/covers/merciless-punks.jpg",
    },
    {
      title: "Unmasked Hearts",
      author: "K.E. Noel",
      link: "https://www.amazon.com/Unmasked-Hearts-K-Noel-ebook/dp/B0FMKP92Y9",
      cover: "/covers/unmasked-hearts.jpg",
    },
  ];

  const comingSoon: Book[] = [
    {
      title: "Beating For You",
      author: "L.L. McAlister",
      link: "https://www.amazon.com/Beating-You-Body-Nobody-That-ebook/dp/B0FNQ2F6P4",
      cover: "/covers/beating-for-you.jpg",
    },
    {
      title: "Whiskey & Lies",
      author: "E.A. Harper",
      link: "https://www.amazon.com/dp/B0FBT3XW76",
      cover: "/covers/whiskey-and-lies.jpg",
    },
  ];

  return (
    <main className="min-h-screen bg-[#050814] text-white overflow-x-hidden">
      <div className="max-w-7xl mx-auto px-6 py-16 md:py-20">
        <header className="mb-16">
          <h1 className="text-4xl md:text-5xl font-bold text-center mb-4">
            Narrated Works
          </h1>
          <p className="text-center text-white/70 text-lg max-w-3xl mx-auto">
            A showcase of audiobook projects I&apos;ve completed and those I&apos;m currently narrating.
          </p>
        </header>

        <section className="mb-24">
          <h2 className="text-2xl md:text-3xl font-bold mb-8 text-center text-white/90">
            Completed Projects
          </h2>
          <HorizontalScroller ariaLabel="Completed projects carousel">
            {completed.map((book, index) => (
              <BookCard key={index} book={book} />
            ))}
          </HorizontalScroller>
        </section>

        <section className="mb-24">
          <h2 className="text-2xl md:text-3xl font-bold mb-8 text-center text-white/90">
            Currently Narrating
          </h2>
          <HorizontalScroller ariaLabel="Currently narrating carousel">
            {inProgress.map((book, index) => (
              <BookCard
                key={index}
                book={book}
                statusBadge={
                  <span className="bg-[#D4AF37] text-black px-2 py-0.5 rounded font-bold uppercase tracking-wider text-[10px]">
                    In Progress
                  </span>
                }
              />
            ))}
          </HorizontalScroller>
        </section>

        <section className="mb-24">
          <h2 className="text-2xl md:text-3xl font-bold mb-8 text-center text-white/90">Coming Soon</h2>
          <HorizontalScroller ariaLabel="Coming soon carousel">
            {comingSoon.map((book, index) => (
              <BookCard
                key={index}
                book={book}
                statusBadge={
                  <span className="bg-white/10 text-white/80 px-2 py-0.5 rounded border border-white/10 uppercase tracking-wider text-[10px]">
                    Coming Soon
                  </span>
                }
              />
            ))}
          </HorizontalScroller>
        </section>

        <footer className="mt-20 text-center">
          <p className="text-white/60 mb-8 text-lg">
            Ready to bring your story to life?
          </p>
          <Link
            href="/#contact"
            className="inline-flex items-center justify-center rounded-full bg-[#D4AF37] text-black px-10 py-4 font-bold hover:bg-[#E0C15A] transition-all transform hover:scale-105 shadow-[0_0_20px_rgba(212,175,55,0.2)]"
          >
            Contact Me
          </Link>
        </footer>
      </div>
    </main>
  );
}