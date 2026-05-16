import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { AuthorHoverName, NarratedBySection } from "./NarratedBySection";
import type { CoNarratorDetail } from "./NarratedBySection";
import { TrackPageView } from "./TrackPageView";
import { PlatformButtons } from "@/app/components/PlatformButtons";

// ─── constants ────────────────────────────────────────────────────────────────

const STATUS_TO_LABEL: Record<string, string> = {
  contracted: "Coming Soon",
  recording:  "Currently Narrating",
  editing:    "Currently Narrating",
  released:   "Completed",
};

const STATUS_TO_STYLE: Record<string, string> = {
  contracted: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  recording:  "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  editing:    "bg-orange-500/20 text-orange-300 border-orange-500/30",
  released:   "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
};

// ─── helpers ──────────────────────────────────────────────────────────────────

function titleToSlug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

// ─── data fetching ────────────────────────────────────────────────────────────

async function getBook(slug: string) {
  const { data } = await supabaseAdmin
    .from("board_cards")
    .select("id, title, subtitle, author, author_notes, cover_url, audible_link, ar_link, spotify_link, co_narrator, tags, description, status")
    .in("status", ["contracted", "recording", "editing", "released"]);
  if (!data) return null;
  return data.find((card) => titleToSlug(card.title ?? "") === slug) ?? null;
}

async function getCoNarratorDetails(names: string[]): Promise<CoNarratorDetail[]> {
  if (!names.length) return [];

  // Try with photo; fall back if column not yet migrated
  const withPhoto = await supabaseAdmin
    .from("co_narrators")
    .select("name, bio, photo")
    .in("name", names);

  if (!withPhoto.error && withPhoto.data) {
    return withPhoto.data.map(cn => ({
      name:  cn.name  as string,
      photo: (cn.photo as string) || null,
      bio:   (cn.bio   as string) || null,
    }));
  }

  const withoutPhoto = await supabaseAdmin
    .from("co_narrators")
    .select("name, bio")
    .in("name", names);

  return (withoutPhoto.data || []).map(cn => ({
    name:  cn.name as string,
    photo: null,
    bio:   (cn.bio as string) || null,
  }));
}

// ─── metadata ─────────────────────────────────────────────────────────────────

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const book = await getBook(slug);
  if (!book) return { title: "Book not found" };

  const description = book.description
    ? book.description.slice(0, 160)
    : `${book.title} narrated by Dean Miller. ${STATUS_TO_LABEL[book.status] ?? ""}`;

  return {
    title: `${book.title} by ${book.author} | Narrated by Dean Miller`,
    description,
    openGraph: {
      title: `${book.title} by ${book.author}`,
      description,
      type: "book",
      images: book.cover_url
        ? [{ url: book.cover_url, width: 600, height: 900, alt: `${book.title} cover` }]
        : [{ url: "/opengraph-image.png", width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${book.title} by ${book.author} | Narrated by Dean Miller`,
      description,
      images: book.cover_url ? [book.cover_url] : ["/opengraph-image.png"],
    },
  };
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default async function BookPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const book = await getBook(slug);
  if (!book) notFound();

  // Fetch all books for prev/next navigation
  const { data: allBooksRaw } = await supabaseAdmin
    .from("board_cards")
    .select("title")
    .in("status", ["contracted", "recording", "editing", "released"])
    .order("sort_order", { ascending: true })
    .order("title",      { ascending: true });
  const allBooks = (allBooksRaw ?? []).filter(b => b.title);
  const currentIdx = allBooks.findIndex(b => titleToSlug(b.title) === slug);
  const prevSlug = currentIdx > 0                   ? titleToSlug(allBooks[currentIdx - 1].title) : null;
  const nextSlug = currentIdx < allBooks.length - 1 ? titleToSlug(allBooks[currentIdx + 1].title) : null;
  const prevTitle = currentIdx > 0                   ? allBooks[currentIdx - 1].title : null;
  const nextTitle = currentIdx < allBooks.length - 1 ? allBooks[currentIdx + 1].title : null;

  // Parse co-narrator (may be JSON string, array, or plain string)
  let coNarratorNames: string[] = [];
  const rawCn = book.co_narrator;
  if (rawCn) {
    try {
      const p = JSON.parse(rawCn);
      coNarratorNames = Array.isArray(p) ? p.filter(Boolean) : p ? [String(p)] : [];
    } catch { coNarratorNames = [String(rawCn)]; }
  }

  const coNarratorDetails = await getCoNarratorDetails(coNarratorNames);

  const statusLabel = STATUS_TO_LABEL[book.status] ?? "";
  const statusStyle = STATUS_TO_STYLE[book.status] ?? "bg-white/10 text-white/50 border-white/10";
  const tags: string[] = Array.isArray(book.tags) ? book.tags : [];
  const isReleased = book.status === "released";
  const authorBio = (book.author_notes as string) || null;

  return (
    <main className="min-h-screen bg-[#06082E] text-white">
      <TrackPageView slug={slug} title={book.title} author={book.author} />

      {/* Book navigation arrows */}
      {prevSlug && (
        <Link href={`/narrated-works/${prevSlug}`} title={prevTitle ?? "Previous"}
          className="fixed left-3 sm:left-5 top-1/2 -translate-y-1/2 z-40 group flex flex-col items-center gap-1.5">
          <div className="p-2.5 sm:p-3 rounded-full bg-[#06082E]/80 backdrop-blur border border-white/10 text-white/30 group-hover:text-[#D4AF37] group-hover:border-[#D4AF37]/40 group-hover:bg-[#D4AF37]/10 transition-all shadow-lg">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
            </svg>
          </div>
          <span className="hidden sm:block text-[10px] text-white/20 group-hover:text-[#D4AF37]/60 transition-colors max-w-[80px] text-center leading-tight truncate">{prevTitle}</span>
        </Link>
      )}
      {nextSlug && (
        <Link href={`/narrated-works/${nextSlug}`} title={nextTitle ?? "Next"}
          className="fixed right-3 sm:right-5 top-1/2 -translate-y-1/2 z-40 group flex flex-col items-center gap-1.5">
          <div className="p-2.5 sm:p-3 rounded-full bg-[#06082E]/80 backdrop-blur border border-white/10 text-white/30 group-hover:text-[#D4AF37] group-hover:border-[#D4AF37]/40 group-hover:bg-[#D4AF37]/10 transition-all shadow-lg">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
            </svg>
          </div>
          <span className="hidden sm:block text-[10px] text-white/20 group-hover:text-[#D4AF37]/60 transition-colors max-w-[80px] text-center leading-tight truncate">{nextTitle}</span>
        </Link>
      )}

      {/* Back link */}
      <div className="max-w-5xl mx-auto px-5 sm:px-8 pt-20 sm:pt-24 pb-4">
        <Link href="/narrated-works"
          className="inline-flex items-center gap-1.5 text-xs text-white/40 hover:text-[#D4AF37] transition-colors">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
          </svg>
          Back to Narrated Works
        </Link>
      </div>

      {/* Hero */}
      <div className="max-w-5xl mx-auto px-5 sm:px-8 pb-16">
        <div className="grid md:grid-cols-[auto_1fr] gap-10 lg:gap-16 items-start">

          {/* Cover — fixed height, natural width, right-anchored so wider covers expand left */}
          <div className="flex justify-center md:justify-end">
            <div className="rounded-2xl overflow-hidden shadow-2xl border border-white/10">
              {book.cover_url ? (
                <Image
                  src={book.cover_url}
                  alt={`${book.title} audiobook cover`}
                  width={600}
                  height={900}
                  style={{ height: "420px", width: "auto" }}
                  className="block max-w-[80vw]"
                  sizes="320px"
                  priority
                />
              ) : (
                <div className="w-[280px] h-[420px] bg-[#0A0D3A] flex items-center justify-center">
                  <svg className="h-16 w-16 text-white/10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                      d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
                  </svg>
                </div>
              )}
            </div>
          </div>

          {/* Details */}
          <div className="relative" itemScope itemType="https://schema.org/AudioObject">

            {/* Status badge */}
            {statusLabel && (
              <span className={`inline-flex items-center text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full border mb-4 ${statusStyle}`}>
                {statusLabel}
              </span>
            )}

            <h1 className="text-3xl sm:text-4xl font-bold text-white leading-tight mb-2" itemProp="name">
              {book.title}
            </h1>

            {book.subtitle && (
              <p className="text-lg text-white/50 mb-3 leading-snug">{book.subtitle}</p>
            )}

            {/* Author name — hover popup shows bio */}
            <AuthorHoverName name={book.author} bio={authorBio} />

            {/* Tags */}
            {tags.length > 0 && (
              <div className="flex flex-nowrap overflow-x-auto scrollbar-hide gap-2 mb-6 pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
                {tags.map(tag => (
                  <span key={tag}
                    className="shrink-0 text-xs font-bold uppercase tracking-wide text-white/50 bg-white/5 border border-white/10 px-3 py-1 rounded-full">
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Description */}
            {book.description && (
              <p className="text-sm sm:text-base text-white/70 leading-relaxed mb-8 max-w-prose">
                {book.description}
              </p>
            )}

            {/* Narrator / co-narrator row — hover popups for each person */}
            <NarratedBySection
              coNarratorNames={coNarratorNames}
              coNarratorDetails={coNarratorDetails}
            />

            {/* CTAs */}
            <div className="flex flex-wrap gap-3">
              <PlatformButtons
                audibleUrl={book.audible_link}
                spotifyUrl={(book as Record<string, unknown>).spotify_link as string | undefined}
                arUrl={book.ar_link}
              />
              <Link href="/contact"
                className="inline-flex items-center gap-2 border border-[#D4AF37]/40 text-[#D4AF37] hover:bg-[#D4AF37]/10 font-semibold px-6 py-3 rounded-full transition-colors text-sm">
                Request a quote
              </Link>
            </div>

          </div>
        </div>

        {/* Bottom CTA */}
        <div className="mt-16 border-t border-white/8 pt-8 sm:pt-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-white/35 text-sm">Interested in having your book narrated?</p>
          <Link href="/contact"
            className="inline-flex items-center justify-center rounded-full bg-[#D4AF37] text-black px-6 py-2.5 text-sm font-semibold hover:bg-[#E0C15A] transition">
            Get in touch
          </Link>
        </div>
      </div>
    </main>
  );
}
