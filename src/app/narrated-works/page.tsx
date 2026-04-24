"use client";

import Image from "next/image";
import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { Book } from "@/types/book";

function BookCard({ book, statusBadge }: { book: Book; statusBadge?: React.ReactNode }) {
  const hasLink = Boolean(book.link?.trim());

  return (
    <div
      className="group relative rounded-2xl overflow-hidden cursor-default"
      itemScope
      itemType="https://schema.org/Book"
      style={{ aspectRatio: "2/3" }}
    >
      {/* Cover image */}
      <Image
        src={book.cover_url}
        alt={`${book.title} audiobook narrated by Dean Miller`}
        fill
        className="object-cover transition-transform duration-700 group-hover:scale-110"
        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 220px"
        itemProp="image"
      />

      {/* Ambient glow — bleeds the dominant cover color into the dark bg */}
      <div className="absolute -inset-2 opacity-0 group-hover:opacity-30 transition-opacity duration-700 blur-2xl bg-[#D4AF37] pointer-events-none z-0" />

      {/* Bottom gradient — always present, grows on hover */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/20 to-transparent transition-opacity duration-500 z-10" />

      {/* Hover content reveal */}
      <div className="absolute inset-0 z-20 flex flex-col justify-end p-4 translate-y-2 group-hover:translate-y-0 transition-transform duration-400">
        {/* Title + author — always visible */}
        <div>
          <h3 className="font-semibold text-sm leading-snug text-white line-clamp-2" itemProp="name">
            {book.title}
          </h3>
          {book.subtitle && (
            <p className="text-[10px] text-white/50 mt-0.5 line-clamp-1">{book.subtitle}</p>
          )}
          <p className="text-xs mt-0.5 text-[#D4AF37] font-medium" itemProp="author">
            {book.author}
          </p>
        </div>

        {/* Tags + link — slide in on hover */}
        <div className="mt-3 opacity-0 group-hover:opacity-100 transition-all duration-300 delay-75">
          <div className="flex flex-wrap gap-1 mb-3">
            {book.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="text-[8px] font-bold uppercase tracking-wide text-white/60 bg-white/10 border border-white/15 px-1.5 py-0.5 rounded"
              >
                {tag}
              </span>
            ))}
          </div>
          {hasLink && (
            <a
              href={book.link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-black bg-[#D4AF37] hover:bg-[#E0C15A] px-3 py-1.5 rounded-md transition-colors"
              aria-label={`Listen to ${book.title} on Audible`}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v13.72l11-6.86L8 5.14z"/></svg>
              Listen on Audible
            </a>
          )}
        </div>
      </div>

      {/* Status badge */}
      {statusBadge && (
        <div className="absolute top-3 right-3 z-30 bg-[#D4AF37] text-black text-[8px] font-bold px-2 py-0.5 rounded uppercase tracking-wide">
          {statusBadge}
        </div>
      )}
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
    <section className="mb-20">
      <div className="flex items-center gap-4 mb-7">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-white/40">{title}</h2>
        <div className="flex-1 h-px bg-white/8" />
        <span className="text-xs text-white/25">{books.length}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5 sm:gap-6">
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
  const hasResults =
    filteredCompleted.length > 0 ||
    filteredInProgress.length > 0 ||
    filteredComingSoon.length > 0;
  const totalBooks = completed.length + inProgress.length + comingSoon.length;

  return (
    <main className="min-h-screen bg-[#050814] text-white">
      <div className="max-w-6xl mx-auto px-5 sm:px-6 pt-14 pb-20">

        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-5 mb-14">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-white/40 mb-2">Portfolio</p>
            <h1 className="text-3xl font-bold text-white">Narrated works</h1>
            {!isLoading && totalBooks > 0 && (
              <p className="mt-1 text-sm text-white/35">{totalBooks} titles across dark romance, romantasy, thriller & more</p>
            )}
          </div>
          {/* Search */}
          <div className="relative sm:w-64">
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
              <button
                onClick={() => setSearchQuery("")}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-white/25 hover:text-white/60 transition"
                type="button"
                aria-label="Clear search"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="py-32 text-center">
            <div className="inline-block h-6 w-6 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !hasResults ? (
          <div className="py-32 text-center">
            <p className="text-white/30">No results for &ldquo;{searchQuery}&rdquo;</p>
            <button onClick={() => setSearchQuery("")} className="mt-3 text-[#D4AF37] text-sm hover:underline" type="button">
              Clear search
            </button>
          </div>
        ) : (
          <>
            <SectionGrid title="Completed" books={filteredCompleted} />
            <SectionGrid title="Currently narrating" books={filteredInProgress} statusBadge="In Progress" />
            <SectionGrid title="Coming soon" books={filteredComingSoon} statusBadge="Soon" />
          </>
        )}

        {/* Footer */}
        <div className="border-t border-white/5 pt-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-white/35 text-sm">Working on your next audiobook?</p>
          <div className="flex gap-3">
            <Link href="/#contact" className="inline-flex items-center justify-center rounded-md bg-[#D4AF37] text-black px-6 py-2.5 text-sm font-semibold hover:bg-[#E0C15A] transition">
              Get in touch
            </Link>
            <Link href="/#demos" className="inline-flex items-center justify-center rounded-md border border-white/15 px-6 py-2.5 text-sm font-semibold text-white/70 hover:border-white/40 hover:text-white transition">
              Listen to demos
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
