"use client";

import Image from "next/image";
import Link from "next/link";
import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";

// --- Types ---
type Book = {
  title: string;
  subtitle?: string;
  author: string;
  link: string;
  cover: string;
  note?: boolean;
  tags: string[];
  description?: string; 
};

interface BookCardProps {
  book: Book;
  statusBadge?: React.ReactNode;
}

// --- Book Card Component ---
function BookCard({ book, statusBadge }: BookCardProps) {
  return (
    <div
      className="group relative rounded-xl overflow-hidden shadow-lg transition-all duration-300 hover:-translate-y-2 border border-[#1A2550] bg-[#0B1224] flex-shrink-0 w-[75vw] sm:w-64 md:w-72 snap-start select-none"
      itemScope
      itemType="https://schema.org/Book"
    >
      {/* Amazon Link - Interactive Z-index */}
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

      {/* Book Cover Container */}
      <div className="relative aspect-[3/4.5] w-full bg-gray-900/40 overflow-hidden">
        <Image
          src={book.cover}
          alt={`${book.title} cover`}
          fill
          draggable={false}
          className="object-cover transition-transform duration-700 group-hover:scale-110"
          sizes="(max-width: 640px) 75vw, 288px"
        />

        {/* Hover Description Overlay - Centered UI */}
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

      {/* Details Container */}
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
    
    // Updated calculation to ensure scrub starts at 0 and ends at 100
    // We adjust the percentage based on the thumb width relative to the container
    const thumbWidth = 64; // width in pixels of the thumb (w-16)
    const containerWidth = el.clientWidth;
    const scrollPercent = max > 0 ? el.scrollLeft / max : 0;
    
    // This allows the left edge of the thumb to hit 0 and the right edge to hit 100%
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
                // Removed translateX(-progress%) to stop it from starting inward
                transform: `translateX(calc(-${progress}% * (64 / 448)))`, // 64 is w-16, 448 is max-w-md
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// --- Main Page Component ---
export default function NarratedWorks() {
  const [searchQuery, setSearchQuery] = useState("");

  const completed: Book[] = [
    {
      title: "The Final Guardian",
      author: "Alexander Kamenetsky",
      link: "https://www.amazon.com/Final-Guardian-Citadel-Mind-Garden/dp/B0G1CNQM8H",
      cover: "/covers/the-final-guardian.jpg",
      tags: ["Sci-Fi Mystery", "Psych Thriller", "AI Horror", "Dystopian"],
      description: "Alexander Stone built a life of perfect order to protect his family from chaos. To test his system, he submits his mind to Michelangelo, the world’s most advanced AI. But the intelligence studying him isn’t just observing. It’s learning. What begins as therapy becomes something far more sinister. Because when you confess your deepest secrets to a machine that is always listening… it never forgets.",
    },
    {
      title: "Santa Promised",
      author: "Laetitia Clark",
      link: "https://www.amazon.com/Santa-Promised-A-Christmas-Novella/dp/B0G6GLQGHK",
      cover: "/covers/santa-promised.jpg",
      tags: ["Duet", "Holiday Romance", "Age Gap", "Single Mom"],
      description: "A heartwarming holiday duet. When a single mother's Christmas wish seems out of reach, an unexpected arrival reminds her that some promises are meant to be kept. Rachel is about to find out she's not damaged goods after all in this fun, spicy Christmas novella.",
    },
    {
      title: "The Circle",
      subtitle: "Rituals & Ruins",
      author: "Lillian Minx Monroe",
      link: "https://www.amazon.com/Audible-The-Circle-Rituals-Ruins/dp/B0GKQY7N27",
      cover: "/covers/the-circle-rituals-and-ruins.jpg",
      tags: ["Dark Romance", "Mystery", "Small Town", "Secrets"],
      description: "The Circle started as a game. Reckless nights, bodies worshiped like temples, and dares that ended in moans instead of consequences. But something has changed. The symbol carved into the wood grows sharper every time we see it, and someone is feeding it in the dark. Our rituals no longer feel like play. We don’t just touch anymore. We take. We claim. We ruin. They say you can walk away from this, but they’ve never felt the ropes, never begged for the burn, never been worshiped and wrecked in the same breath. The Circle doesn’t play anymore. It practices. And once you’re marked, you belong to it.",
    },
    {
      title: "Heir of the Emberscale",
      author: "Shelby Gardner",
      link: "https://www.amazon.com/Heir-Emberscale-Shelby-Gardner-ebook/dp/B0FXR4Y9JB",
      cover: "/covers/heir-of-emberscale.jpg",
      tags: ["Fantasy Romance", "Epic", "War & Love", "Dragon Lore"],
      description: "She was just a survivor. He was a ruthless king. Their fate is sealed when Elyria discovers the ancient Aura Stone, which marks her as the last Queen and binds her to Tyrion, the powerful master of the Ember Stone. Forced into an unwilling partnership, they must navigate their dangerous bond, mythical forces, and a dying world. To save it, Elyria and Tyrion must overcome their hatred and accept the destiny that ties them together.",
    },
    {
      title: "Sultry Secrets: Tease",
      author: "Bethanie Loren",
      link: "https://www.amazon.com/-/es/Bethanie-Loren-ebook/dp/B0G6VDHL9L",
      cover: "/covers/sultry-secrets-tease.jpg",
      tags: ["LGBTQ+", "Friends to Lovers", "Spicy", "Contemporary"],
      description: "I love my husband, I really do. But have you ever wanted something more? Just the perfect cherry on top? Tonight is my night to have it all. Just one night where I can have the best of both worlds, no matter what that looks like.",
    },

  ];

  const inProgress: Book[] = [
    {
      title: "No One to Hold Me",
      author: "Noelle Rahn-Johnson",
      link: "https://www.amazon.com/No-One-Hold-Noelle-Rahn-Johnson-ebook/dp/B088RMPLYX",
      cover: "/covers/no-one-to-hold-me.jpg",
      tags: ["Steamy Romance", "Emotional", "POV Narratives", "Contemporary"],
      description: "Kenneth wakes to smoke and a blaring fire alarm, the day he loses half his life. Burdened by guilt, depression, and the weight of raising his young daughter alone, he struggles to survive until an unexpected meeting changes everything. Amanda has spent years hiding her anger and betrayal while raising her son as a single mother. Life is hard until she meets a man and his daughter who begin to heal her world. For both of them, what once felt like having no one to hold finally changes.",
    },
    {
      title: "Merciless Punks",
      author: "Madeline Fay",
      link: "https://www.amazon.com/Merciless-Punks-Enemies-romance-douchebags-ebook/dp/B09Z9P3C7V",
      cover: "/covers/merciless-punks.jpg",
      tags: ["Dark Romance", "Bully", "Why Choose", "MC Club"],
      description: "Spite was only the beginning. Vicious was a warning. This is merciless. The punks who rule this town have stopped pretending there are lines they won’t cross. What began as control has become something colder and impossible to escape. They don’t ask for loyalty. They demand it. Every secret pulls me deeper into their world, where mercy is weakness and love only sharpens them. Because once you belong to the merciless, there’s no walking away.",
    },
    {
      title: "Unmasked Hearts",
      author: "K.E. Noel",
      link: "https://www.amazon.com/Unmasked-Hearts-K-Noel-ebook/dp/B0FMKP92Y9",
      cover: "/covers/unmasked-hearts.jpg",
      tags: ["Dual POV", "Contemporary", "Emotional", "Small Town"],
      description: "Madison Mitchell has overcome many challenges and is finally thriving in her dream career as an ER nurse, though her personal life, especially love, has been far less successful. Darius Stone lives a lavish life and embraces his reputation as a carefree playboy with no intention of settling down. When fate brings them back into each other’s lives years later, they must confront hidden truths and decide whether their hearts can survive what comes to light.",
    },
    {
      title: "Blood on the Asphalt",
      author: "River Fox",
      link: "",
      cover: "/covers/blood-on-the-asphalt.jpg",
      tags: ["MC Romance", "Wolf-shifter", "Fated Mates", "Reverse Harem"],
      description: "A high-stakes character study following MMC Tempest through the underworld of the city. Justice is rare, but revenge is always on the menu.",
    },
  ];

  const comingSoon: Book[] = [
    {
      title: "Beating For You",
      author: "L.L. McAlister",
      link: "https://www.amazon.com/Beating-You-Body-Nobody-That-ebook/dp/B0FNQ2F6P4",
      cover: "/covers/beating-for-you.jpg",
      tags: ["Dark Romance", "Obsession", "Sacrifice", "Morally Grey"],
      description: "He has two sides. She has one broken heart. When a broken, tortured man with secrets stitched into his soul falls for a girl with a failing heart, love becomes more than obsession—it becomes survival. A love so twisted, it’s criminal. A sacrifice so final, it’s beautiful. How far would you go for the one person who makes your heart beat?",
    },
    {
      title: "Whiskey & Lies",
      author: "E.A. Harper",
      link: "https://www.amazon.com/dp/B0FBT3XW76",
      cover: "/covers/whiskey-and-lies.jpg",
      tags: ["Primal Play", "Touch & Die", "Protective Billionaire", "Mutual Obsession"],
      description: "Curvy, bold, and reckless, Octavia Moore never expected her fake résumé to land her a job at Digi Pulse—or put her face to face with Dominic Callahan again. Powerful and obsessive, Dominic never forgot the woman who once caught his attention. When her résumé crossed his desk, he hired her without hesitation. Now Octavia is back in his world, unaware that the charming CEO she works for hides a far darker side. And when the truth begins to unravel, Dominic is determined to prove one thing—he never loses.",
    },
  ];

  const filterBooks = (books: Book[]) => {
    if (!searchQuery) return books;
    const q = searchQuery.toLowerCase();
    return books.filter(
      (b) =>
        b.title.toLowerCase().includes(q) ||
        b.author.toLowerCase().includes(q) ||
        b.tags.some((t) => t.toLowerCase().includes(q))
    );
  };

  const filteredCompleted = useMemo(() => filterBooks(completed), [searchQuery]);
  const filteredInProgress = useMemo(() => filterBooks(inProgress), [searchQuery]);
  const filteredComingSoon = useMemo(() => filterBooks(comingSoon), [searchQuery]);

  const hasResults =
    filteredCompleted.length > 0 ||
    filteredInProgress.length > 0 ||
    filteredComingSoon.length > 0;

  return (
    <main className="min-h-screen bg-[#050814] text-white overflow-x-hidden">
      <h1 className="sr-only">Dean Miller Audiobook Narrator Portfolio – Narrated Works</h1>

      <div className="max-w-7xl mx-auto py-16 md:py-24">
        <header className="mb-12 text-center px-6">
          <h2 className="text-4xl md:text-6xl font-bold mb-4">Narrated Works</h2>
          <p className="text-white/60 text-lg max-w-2xl mx-auto">
            Explore my portfolio of professional audiobook narrations.
            Specializing in dark romance, romantasy, and emotionally driven
            fiction available on Amazon and Audible.
          </p>

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
            <button onClick={() => setSearchQuery("")} className="mt-4 text-[#D4AF37] text-sm hover:underline" type="button">
              Clear search
            </button>
          </div>
        ) : (
          <>
            {filteredCompleted.length > 0 && (
              <section className="mb-20">
                <h2 className="text-2xl font-bold mb-8 text-center uppercase tracking-widest text-white/90">
                  Completed Audiobook Projects
                </h2>
                <HorizontalScroller ariaLabel="Completed projects">
                  {filteredCompleted.map((book) => <BookCard key={book.link} book={book} />)}
                </HorizontalScroller>
              </section>
            )}

            {filteredInProgress.length > 0 && (
              <section className="mb-20">
                <h2 className="text-2xl font-bold mb-8 text-center uppercase tracking-widest text-white/90">
                  Currently Narrating
                </h2>
                <HorizontalScroller ariaLabel="Currently narrating">
                  {filteredInProgress.map((book) => (
                    <BookCard key={book.link} book={book} statusBadge="In Progress" />
                  ))}
                </HorizontalScroller>
              </section>
            )}

            {filteredComingSoon.length > 0 && (
              <section className="mb-20">
                <h2 className="text-2xl font-bold mb-8 text-center uppercase tracking-widest text-white/90">
                  Coming Soon to Audible
                </h2>
                <HorizontalScroller ariaLabel="Coming soon">
                  {filteredComingSoon.map((book) => (
                    <BookCard key={book.link} book={book} statusBadge="Soon" />
                  ))}
                </HorizontalScroller>
              </section>
            )}
          </>
        )}

        <footer className="mt-24 text-center">
          <p className="mb-8 text-white/50 text-sm italic">
            Looking for a specific tone or character range for your next project?
          </p>
          <Link href="/#contact" className="inline-flex items-center justify-center rounded-full bg-[#D4AF37] text-black px-10 py-4 font-bold hover:scale-105 transition-all">
            Request a Custom Narration Quote
          </Link>
        </footer>
      </div>
    </main>
  );
}