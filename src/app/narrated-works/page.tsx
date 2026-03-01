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
      className="
        group relative rounded-xl overflow-hidden shadow-lg 
        hover:shadow-2xl transition-all duration-300 hover:-translate-y-2 
        border border-[#1A2550] bg-[#0B1224] flex-shrink-0 
        w-56 sm:w-64 snap-start
      "
    >
      <div className="relative aspect-[3/4.5] w-full bg-gray-900/40">
        <Image
          src={book.cover}
          alt={`${book.title} book cover`}
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-105"
          sizes="(max-width: 640px) 70vw, 256px"
          // placeholder="blur"          // ← uncomment + add blurDataURL when you implement it
          // blurDataURL={book.blurDataURL}
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

      <div className="p-4 text-center">
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

interface HorizontalScrollerProps {
  children: React.ReactNode;
  ariaLabel: string;
}

function HorizontalScroller({ children, ariaLabel }: HorizontalScrollerProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showBar, setShowBar] = useState(false);

  const getMaxScroll = useCallback(() => {
    const el = scrollerRef.current;
    return el ? Math.max(0, el.scrollWidth - el.clientWidth) : 0;
  }, []);

  const updateProgress = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const max = getMaxScroll();
    setProgress(max > 0 ? (el.scrollLeft / max) * 100 : 0);
  }, [getMaxScroll]);

  const updateLayout = useCallback(() => {
    const max = getMaxScroll();
    setShowBar(max > 4);
    updateProgress();
  }, [getMaxScroll, updateProgress]);

  // Layout / resize / scroll listeners
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    const ro = new ResizeObserver(updateLayout);
    ro.observe(el);

    el.addEventListener("scroll", updateProgress, { passive: true });
    window.addEventListener("resize", updateLayout);

    updateLayout(); // initial check

    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", updateProgress);
      window.removeEventListener("resize", updateLayout);
    };
  }, [updateLayout, updateProgress]);

  // Drag to scroll the cards
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    let startX = 0;
    let startScrollLeft = 0;

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      startX = e.clientX;
      startScrollLeft = el.scrollLeft;
      setIsDragging(true);
      el.setPointerCapture(e.pointerId);
      el.style.userSelect = "none";
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!el.hasPointerCapture(e.pointerId)) return;
      const dx = e.clientX - startX;
      el.scrollLeft = startScrollLeft - dx;
    };

    const onPointerUp = () => {
      setIsDragging(false);
      el.style.userSelect = "";
    };

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerUp);

    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerUp);
    };
  }, []);

  // Thumb drag
  useEffect(() => {
    const thumb = thumbRef.current;
    if (!thumb) return;

    const moveToClientX = (clientX: number) => {
      const track = trackRef.current;
      const scroller = scrollerRef.current;
      if (!track || !scroller) return;

      const rect = track.getBoundingClientRect();
      const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
      const pct = x / rect.width;
      scroller.scrollLeft = pct * getMaxScroll();
      updateProgress();
    };

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      thumb.setPointerCapture(e.pointerId);
      setIsDragging(true);
      moveToClientX(e.clientX);
    };

    const onMove = (e: PointerEvent) => {
      if (!thumb.hasPointerCapture(e.pointerId)) return;
      moveToClientX(e.clientX);
    };

    const onUp = () => {
      setIsDragging(false);
    };

    thumb.addEventListener("pointerdown", onDown);
    thumb.addEventListener("pointermove", onMove);
    thumb.addEventListener("pointerup", onUp);
    thumb.addEventListener("pointercancel", onUp);

    return () => {
      thumb.removeEventListener("pointerdown", onDown);
      thumb.removeEventListener("pointermove", onMove);
      thumb.removeEventListener("pointerup", onUp);
      thumb.removeEventListener("pointercancel", onUp);
    };
  }, [getMaxScroll, updateProgress]);

  // Click on track to jump
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const onDown = (e: PointerEvent) => {
      if (e.target === thumbRef.current) return;
      const rect = track.getBoundingClientRect();
      const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
      const pct = x / rect.width;
      const scroller = scrollerRef.current;
      if (scroller) {
        scroller.scrollLeft = pct * getMaxScroll();
        updateProgress();
      }
    };

    track.addEventListener("pointerdown", onDown);
    return () => track.removeEventListener("pointerdown", onDown);
  }, [getMaxScroll, updateProgress]);

  return (
    <div className="relative">
      {/* Fade edges */}
      <div className="absolute left-0 top-0 bottom-0 w-16 sm:w-24 bg-gradient-to-r from-[#050814] to-transparent z-10 pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-16 sm:w-24 bg-gradient-to-l from-[#050814] to-transparent z-10 pointer-events-none" />

      <div
        ref={scrollerRef}
        className={`
          flex overflow-x-auto pb-8 sm:pb-10 
          snap-x snap-mandatory scroll-smooth gap-5 sm:gap-7 px-4 sm:px-6
          hide-scrollbar select-none touch-pan-x
          ${isDragging ? "cursor-grabbing" : "cursor-grab active:cursor-grabbing"}
        `}
        aria-label={ariaLabel}
      >
        {children}
        <div className="flex-shrink-0 w-12 sm:w-20" />
      </div>

      {showBar && (
        <div className="mt-5 sm:mt-6 flex justify-center px-4">
          <div className="w-full max-w-md">
            <div
              ref={trackRef}
              className="relative h-3.5 sm:h-4 rounded-full bg-white/10 border border-white/10 cursor-pointer"
              role="slider"
              aria-label={`${ariaLabel} scrollbar`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress)}
              tabIndex={0}
            >
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-[#D4AF37]/30 transition-all"
                style={{ width: `${progress}%` }}
              />
              <div
                ref={thumbRef}
                className={`
                  absolute top-1/2 -translate-y-1/2 h-5 w-10 sm:h-6 sm:w-12 
                  rounded-full bg-[#D4AF37] shadow-md cursor-grab active:cursor-grabbing
                  transition-transform duration-150
                  ${isDragging ? "scale-110 shadow-xl" : ""}
                `}
                style={{
                  left: `calc(${progress}% - ${progress > 90 ? 48 : 24}px)`,
                }}
                aria-label="Drag to scroll"
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
    <main className="min-h-screen bg-[#050814] text-white">
      <div className="max-w-7xl mx-auto px-6 py-16 md:py-20">
        <h1 className="text-4xl md:text-5xl font-bold text-center mb-4">
          Narrated Works
        </h1>
        <p className="text-center text-white/70 text-lg mb-16 max-w-3xl mx-auto">
          A showcase of audiobook projects I&apos;ve completed and those I&apos;m
          currently narrating.
        </p>

        <section className="mb-20">
          <h2 className="text-3xl font-bold mb-8 text-center">
            Completed Projects
          </h2>
          <HorizontalScroller ariaLabel="Completed projects carousel">
            {completed.map((book, index) => (
              <BookCard key={index} book={book} />
            ))}
          </HorizontalScroller>
        </section>

        <section className="mb-20">
          <h2 className="text-3xl font-bold mb-8 text-center">
            Currently Narrating
          </h2>
          <HorizontalScroller ariaLabel="Currently narrating carousel">
            {inProgress.map((book, index) => (
              <BookCard
                key={index}
                book={book}
                statusBadge={
                  <span className="bg-[#D4AF37] text-black px-2 py-0.5 rounded">
                    In Progress
                  </span>
                }
              />
            ))}
          </HorizontalScroller>
        </section>

        <section className="mb-20">
          <h2 className="text-3xl font-bold mb-8 text-center">Coming Soon</h2>
          <HorizontalScroller ariaLabel="Coming soon carousel">
            {comingSoon.map((book, index) => (
              <BookCard
                key={index}
                book={book}
                statusBadge={
                  <span className="bg-white/15 text-white px-2 py-0.5 rounded border border-white/10">
                    Coming Soon
                  </span>
                }
              />
            ))}
          </HorizontalScroller>
        </section>

        <div className="mt-16 text-center">
          <p className="text-white/70 mb-6 text-lg">
            Ready to bring your story to life?
          </p>
          <Link
            href="/#contact"
            className="inline-flex items-center justify-center rounded-md bg-[#D4AF37] text-black px-8 py-4 font-semibold hover:bg-[#E0C15A] transition text-lg shadow-lg hover:shadow-2xl"
          >
            Contact Me
          </Link>
        </div>
      </div>
    </main>
  );
}