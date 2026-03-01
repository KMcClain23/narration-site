"use client";

import Image from "next/image";
import Link from "next/link";
import React, { useEffect, useRef, useState } from "react";

export default function NarratedWorks() {
  const completed = [
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
      note: false,
    },
    {
      title: "Heir of the Emberscale",
      author: "Shelby Gardner",
      link: "https://www.amazon.com/Heir-Emberscale-Shelby-Gardner-ebook/dp/B0FXR4Y9JB",
      cover: "/covers/heir-of-emberscale.jpg",
    },
  ];

  const inProgress = [
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

  const comingSoon = [
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

  const BookCard = ({
    book,
    statusBadge = null,
  }: {
    book: any;
    statusBadge?: React.ReactNode;
  }) => (
    <a
      href={book.link}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative rounded-xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 hover:-translate-y-2 border border-[#1A2550] bg-[#0B1224] flex-shrink-0 w-56 sm:w-64 snap-start"
    >
      <div className="relative aspect-[3/4.5] w-full">
        <Image
          src={book.cover}
          alt={`${book.title} cover`}
          fill
          draggable={false}
          className="object-cover transition-transform duration-500 group-hover:scale-105"
          sizes="(max-width: 640px) 70vw, 240px"
        />
      </div>

      {statusBadge && (
        <div className="absolute top-3 right-3 bg-opacity-90 text-xs font-semibold px-2.5 py-1 rounded">
          {statusBadge}
        </div>
      )}

      <div className="p-4 text-center">
        <h3 className="font-semibold text-base leading-tight text-white">
          {book.title}
        </h3>
        {book.subtitle && (
          <p className="text-sm text-white/80 mt-0.5">{book.subtitle}</p>
        )}
        <p className="text-sm mt-1.5 text-[#D4AF37] font-medium">
          {book.author}
        </p>
      </div>

      {book.note && (
        <div className="absolute top-3 left-3 bg-yellow-600/80 text-white text-xs px-2 py-1 rounded">
          Note
        </div>
      )}
    </a>
  );

  function HorizontalScroller({
    children,
    ariaLabel,
  }: {
    children: React.ReactNode;
    ariaLabel: string;
  }) {
    const scrollerRef = useRef<HTMLDivElement | null>(null);
    const trackRef = useRef<HTMLDivElement | null>(null);
    const thumbRef = useRef<HTMLDivElement | null>(null);

    // drag state for the cards row
    const draggingCardsRef = useRef(false);
    const cardsDrag = useRef({
      startX: 0,
      startScrollLeft: 0,
      moved: false,
      pointerId: -1,
    });

    // drag state for the thumb scrubber
    const draggingThumbRef = useRef(false);
    const thumbDrag = useRef({
      pointerId: -1,
    });

    const [cursorDragging, setCursorDragging] = useState(false);
    const [progressPct, setProgressPct] = useState(0);
    const [needsBar, setNeedsBar] = useState(false);

    const getMaxScroll = () => {
      const el = scrollerRef.current;
      if (!el) return 0;
      return Math.max(0, el.scrollWidth - el.clientWidth);
    };

    const computeNeedsBar = () => {
      const el = scrollerRef.current;
      if (!el) return;

      const maxScroll = getMaxScroll();
      const shouldShow = maxScroll > 2; // tiny threshold avoids flicker from rounding
      setNeedsBar(shouldShow);

      // also keep progress in sync when layout changes
      const pct = maxScroll > 0 ? (el.scrollLeft / maxScroll) * 100 : 0;
      setProgressPct(Math.min(100, Math.max(0, pct)));
    };

    const setProgressFromScroll = () => {
      const el = scrollerRef.current;
      if (!el) return;
      const maxScroll = getMaxScroll();
      const pct = maxScroll > 0 ? (el.scrollLeft / maxScroll) * 100 : 0;
      setProgressPct(Math.min(100, Math.max(0, pct)));
    };

    const setScrollFromClientXOnTrack = (clientX: number) => {
      const el = scrollerRef.current;
      const track = trackRef.current;
      if (!el || !track) return;

      const rect = track.getBoundingClientRect();
      const x = Math.min(Math.max(0, clientX - rect.left), rect.width);
      const ratio = rect.width > 0 ? x / rect.width : 0;

      const maxScroll = getMaxScroll();
      el.scrollLeft = ratio * maxScroll;
      setProgressFromScroll();
    };

    // Detect overflow (needsBar) and keep in sync on resize/content changes
    useEffect(() => {
      const el = scrollerRef.current;
      if (!el) return;

      computeNeedsBar();

      // Keep updated on scroll + resize
      el.addEventListener("scroll", setProgressFromScroll, { passive: true });
      window.addEventListener("resize", computeNeedsBar);

      // Watch for changes inside the scroller (images loading, font changes, etc.)
      const ro = new ResizeObserver(() => computeNeedsBar());
      ro.observe(el);

      return () => {
        el.removeEventListener("scroll", setProgressFromScroll);
        window.removeEventListener("resize", computeNeedsBar);
        ro.disconnect();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Drag to scroll the cards themselves
    useEffect(() => {
      const el = scrollerRef.current;
      if (!el) return;

      const onPointerDown = (e: PointerEvent) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;

        draggingCardsRef.current = true;
        setCursorDragging(true);

        cardsDrag.current.pointerId = e.pointerId;
        cardsDrag.current.startX = e.clientX;
        cardsDrag.current.startScrollLeft = el.scrollLeft;
        cardsDrag.current.moved = false;

        el.setPointerCapture(e.pointerId);
      };

      const onPointerMove = (e: PointerEvent) => {
        if (!draggingCardsRef.current) return;
        if (cardsDrag.current.pointerId !== e.pointerId) return;

        const dx = e.clientX - cardsDrag.current.startX;
        if (Math.abs(dx) > 6) cardsDrag.current.moved = true;

        el.scrollLeft = cardsDrag.current.startScrollLeft - dx;
      };

      const endDrag = (e: PointerEvent) => {
        if (cardsDrag.current.pointerId !== e.pointerId) return;

        draggingCardsRef.current = false;
        setCursorDragging(false);
        cardsDrag.current.pointerId = -1;
      };

      const onClickCapture = (e: MouseEvent) => {
        if (cardsDrag.current.moved) {
          e.preventDefault();
          e.stopPropagation();
          cardsDrag.current.moved = false;
        }
      };

      el.addEventListener("pointerdown", onPointerDown);
      el.addEventListener("pointermove", onPointerMove);
      el.addEventListener("pointerup", endDrag);
      el.addEventListener("pointercancel", endDrag);
      el.addEventListener("click", onClickCapture, true);

      return () => {
        el.removeEventListener("pointerdown", onPointerDown);
        el.removeEventListener("pointermove", onPointerMove);
        el.removeEventListener("pointerup", endDrag);
        el.removeEventListener("pointercancel", endDrag);
        el.removeEventListener("click", onClickCapture, true);
      };
    }, []);

    // Drag the thumb (grab handle) to scrub
    useEffect(() => {
      const thumb = thumbRef.current;
      const track = trackRef.current;
      if (!thumb || !track) return;

      const onPointerDown = (e: PointerEvent) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;

        draggingThumbRef.current = true;
        thumbDrag.current.pointerId = e.pointerId;

        thumb.setPointerCapture(e.pointerId);
        setScrollFromClientXOnTrack(e.clientX);
      };

      const onPointerMove = (e: PointerEvent) => {
        if (!draggingThumbRef.current) return;
        if (thumbDrag.current.pointerId !== e.pointerId) return;

        setScrollFromClientXOnTrack(e.clientX);
      };

      const endThumb = (e: PointerEvent) => {
        if (thumbDrag.current.pointerId !== e.pointerId) return;

        draggingThumbRef.current = false;
        thumbDrag.current.pointerId = -1;
      };

      thumb.addEventListener("pointerdown", onPointerDown);
      thumb.addEventListener("pointermove", onPointerMove);
      thumb.addEventListener("pointerup", endThumb);
      thumb.addEventListener("pointercancel", endThumb);

      return () => {
        thumb.removeEventListener("pointerdown", onPointerDown);
        thumb.removeEventListener("pointermove", onPointerMove);
        thumb.removeEventListener("pointerup", endThumb);
        thumb.removeEventListener("pointercancel", endThumb);
      };
    }, []);

    // Clicking the track jumps too (only when bar is visible)
    useEffect(() => {
      const track = trackRef.current;
      if (!track) return;

      const onPointerDown = (e: PointerEvent) => {
        if (e.target === thumbRef.current) return;
        if (e.pointerType === "mouse" && e.button !== 0) return;
        setScrollFromClientXOnTrack(e.clientX);
      };

      track.addEventListener("pointerdown", onPointerDown);

      return () => {
        track.removeEventListener("pointerdown", onPointerDown);
      };
    }, []);

    return (
      <div className="relative">
        <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-[#050814] to-transparent z-10 pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-[#050814] to-transparent z-10 pointer-events-none" />

        <div
          ref={scrollerRef}
          className={[
            "flex overflow-x-auto pb-6 snap-x snap-mandatory scroll-smooth gap-6 px-4",
            "hide-scrollbar select-none",
            cursorDragging ? "cursor-grabbing" : "cursor-grab",
          ].join(" ")}
          style={{ touchAction: "pan-y" }}
          aria-label={ariaLabel}
        >
          {children}
          <div className="flex-shrink-0 w-4 sm:w-8" />
        </div>

        {/* Only show bar if overflow exists */}
        {needsBar && (
          <div className="mt-4 flex justify-center">
            <div className="w-1/2 max-w-sm">
              <div
                ref={trackRef}
                className="relative h-3 rounded-full bg-white/10 border border-white/10"
                role="slider"
                aria-label={`${ariaLabel} scroll position`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progressPct)}
              >
                <div
                  className="absolute left-0 top-0 h-full rounded-full bg-[#D4AF37]/35"
                  style={{ width: `${progressPct}%` }}
                />

                <div
                  ref={thumbRef}
                  className="absolute top-1/2 -translate-y-1/2 h-4 w-10 rounded-full bg-[#D4AF37] shadow-lg cursor-grab active:cursor-grabbing"
                  style={{
                    left: `calc(${progressPct}% - 20px)`,
                  }}
                  aria-label="Scroll thumb"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

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