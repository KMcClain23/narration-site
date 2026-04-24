"use client";

import Image from "next/image";
import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { Book } from "@/types/book";

function ExternalLinkIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

function BookCard({ book, statusBadge }: { book: Book; statusBadge?: React.ReactNode }) {
  const hasLink = Boolean(book.link?.trim());

  return (
    <div
      className="group relative rounded-xl overflow-hidden border border-[#1A2550] bg-[#0B1224] transition-all duration-300 hover:border-[#D4AF37]/40 hover:-translate-y-1"
      itemScope
      itemType="https://schema.org/Book"
    >
      {/* Cover */}
      <div className="relative aspect-[2/3] w-full bg-gray-900/40 overflow-hidden">
        <Image
          src={book.cover_url}
          alt={`${book.title} audiobook cover`}
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-105"
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 200px"
        />

        {/* Hover synopsis overlay */}
        <div className="absolute inset-0 bg-black/85 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-all duration-400 flex flex-col justify-center p-4 z-10 pointer-events-none">
          <p className="text-[#D4AF37] text-[9px] font-bold uppercase tracking-widest mb-2">Synopsis</p>
          <p className="text-white/90 text-[11px] leading-relaxed italic line-clamp-[12]">
            {book.description || "Full description on Amazon."}
          </p>
        </div>

        {/* Badges */}
        {statusBadge && (
          <div className="absolute top-2 right-2 z-20 bg-[#D4AF37] text-black text-[9px] font-bold px-2 py-0.5 rounded uppercase">
            {statusBadge}
          </div>
        )}

        {/* External link */}
        {hasLink && (
          <a
            href={book.link}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute top-2 left-2 z-20 bg-black/60 border border-[#D4AF37]/40 text-[#D4AF37] p-1.5 rounded-lg backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-all pointer-events-auto hover:bg-[#D4AF37] hover:text-black"
            aria-label={`View ${book.title} on Amazon`}
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLinkIcon />
          </a>
        )}
      </div>

      {/* Info */}
      <div className="p-3 text-center">
        <h3
          className="font-semibold text-sm leading-tight text-white line-clamp-2"
          itemProp="name"
        >
          {book.title}
        </h3>
        {book.subtitle && (
          <p className="text-[11px] text-white/55 mt-0.5 line-clamp-1">{book.subtitle}</p>
        )}
        <p className="text-xs mt-1 text-[#D4AF37] font-medium" itemProp="author">
          {book.author}
        </p>
        <div className="mt-2 flex flex-wrap justify-center gap-1">
          {book.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="bg-black/60 text-[#D4AF37]/80 text-[8px] font-semibold px-1.5 py-0.5 rounded border border-[#D4AF37]/25 uppercase tracking-tight"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function SectionGrid({
  title,
  books,
  statusBadge,
}: {
  title: string;
  books: Book[];
  statusBadge?: React.ReactNode;
}) {
  if (books.length === 0) return null;
  return (
    <section className="mb-16">
      <h2 className="text-lg font-semibold text-white/70 mb-5">{title}</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {books.map((book) => (
          <BookCard key={book.id} book={book} statusBadge={statusBadge} />
        ))}
      </div>
    </section>
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
        if (!response.ok) { console.error(result.error || "Failed to load books."); return; }
        setBooks(result.books || []);
      } catch (error) {
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    };
    loadBooks();
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

  return (
    <main className="min-h-screen bg-[#050814] text-white">
      <div className="max-w-6xl mx-auto px-5 sm:px-6 py-14">

        {/* Compact page header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-12 border-b border-white/8 pb-8">
          <div>
            <h1 className="text-3xl font-bold text-white">Narrated works</h1>
            <p className="mt-1 text-sm text-white/50">
              Dark romance · romantasy · LGBTQ+ fiction · thriller · drama
            </p>
          </div>
          {/* Search inline with header */}
          <div className="relative sm:w-64 lg:w-80">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="h-4 w-4 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              placeholder="Title, author, or genre…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#0B1224] border border-[#1A2550] rounded-lg py-2.5 pl-9 pr-4 text-sm focus:outline-none focus:border-[#D4AF37]/50 transition-all placeholder:text-white/25"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-white/30 hover:text-white/70 transition"
                type="button"
                aria-label="Clear search"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="py-20 text-center">
            <p className="text-white/30 text-sm">Loading…</p>
          </div>
        ) : !hasResults ? (
          <div className="py-20 text-center">
            <p className="text-white/40">No results for &ldquo;{searchQuery}&rdquo;</p>
            <button onClick={() => setSearchQuery("")} className="mt-3 text-[#D4AF37] text-sm hover:underline" type="button">
              Clear search
            </button>
          </div>
        ) : (
          <>
            <SectionGrid title="Completed projects" books={filteredCompleted} />
            <SectionGrid title="Currently narrating" books={filteredInProgress} statusBadge="In Progress" />
            <SectionGrid title="Coming soon to Audible" books={filteredComingSoon} statusBadge="Soon" />
          </>
        )}

        {/* Footer CTA */}
        <div className="mt-8 border-t border-white/5 pt-12 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-white/50 text-sm">Working on your next audiobook project?</p>
          <div className="flex gap-3">
            <Link href="/#contact" className="inline-flex items-center justify-center rounded-md bg-[#D4AF37] text-black px-6 py-2.5 text-sm font-semibold hover:bg-[#E0C15A] transition">
              Get in touch
            </Link>
            <Link href="/#demos" className="inline-flex items-center justify-center rounded-md border border-white/20 px-6 py-2.5 text-sm font-semibold text-white/90 hover:border-white/50 transition">
              Listen to demos
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
