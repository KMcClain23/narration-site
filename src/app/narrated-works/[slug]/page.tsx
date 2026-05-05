import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";

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

function getInitials(name: string): string {
  return name.split(/\s+/).map(w => w[0] ?? "").join("").slice(0, 2).toUpperCase();
}

// Deterministic avatar background colour from name
const AVATAR_COLORS = [
  "bg-violet-800", "bg-indigo-800", "bg-sky-800",
  "bg-teal-800",   "bg-rose-900",   "bg-amber-900",
];
function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

// ─── data fetching ────────────────────────────────────────────────────────────

type CoNarratorDetail = { name: string; photo: string | null; bio: string | null };

async function getBook(slug: string) {
  const { data } = await supabaseAdmin
    .from("board_cards")
    .select("id, title, subtitle, author, cover_url, audible_link, ar_link, co_narrator, tags, description, status")
    .in("status", ["contracted", "recording", "editing", "released"]);
  if (!data) return null;
  return data.find((card) => titleToSlug(card.title ?? "") === slug) ?? null;
}

async function getCoNarratorDetails(names: string[]): Promise<CoNarratorDetail[]> {
  if (!names.length) return [];

  // Try to select photo column; fall back if it doesn't exist yet
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
    title: `${book.title} — Dean Miller Narration`,
    description,
    openGraph: {
      title: book.title,
      description,
      images: book.cover_url ? [{ url: book.cover_url, width: 600, height: 900 }] : [],
    },
    twitter: {
      card: "summary_large_image",
      title: book.title,
      description,
      images: book.cover_url ? [book.cover_url] : [],
    },
  };
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default async function BookPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const book = await getBook(slug);
  if (!book) notFound();

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

  return (
    <main className="min-h-screen bg-[#06082E] text-white">

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
        <div className="grid md:grid-cols-[280px_1fr] gap-10 lg:gap-16 items-start">

          {/* Cover */}
          <div className="mx-auto w-full max-w-[280px] md:max-w-none">
            <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-white/10"
              style={{ aspectRatio: "2/3" }}>
              {book.cover_url ? (
                <Image
                  src={book.cover_url}
                  alt={`${book.title} audiobook cover`}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 80vw, 280px"
                  priority
                />
              ) : (
                <div className="w-full h-full bg-[#0A0D3A] flex items-center justify-center">
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

            <p className="text-[#D4AF37] font-semibold text-lg mb-5" itemProp="byArtist">
              {book.author}
            </p>

            {/* Tags */}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-6">
                {tags.map(tag => (
                  <span key={tag}
                    className="text-xs font-bold uppercase tracking-wide text-white/50 bg-white/5 border border-white/10 px-3 py-1 rounded-full">
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

            {/* ── Narrated by ─────────────────────────────────────────── */}
            <div className="mb-8">
              <p className="text-[10px] uppercase tracking-[0.22em] text-white/35 font-semibold mb-3">
                Narrated by
              </p>
              <div className="flex flex-wrap gap-5">

                {/* Dean Miller */}
                <Link
                  href="/about"
                  className="flex items-center gap-3 group/dean"
                  aria-label="About Dean Miller"
                >
                  <div className="relative h-11 w-11 rounded-full overflow-hidden border border-white/15 shrink-0 ring-2 ring-transparent group-hover/dean:ring-[#D4AF37]/50 transition-all">
                    <Image
                      src="/dean-headshot.jpg"
                      alt="Dean Miller"
                      fill
                      className="object-cover object-top"
                      sizes="44px"
                    />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white group-hover/dean:text-[#D4AF37] transition-colors leading-tight">
                      Dean Miller
                    </p>
                    <p className="text-[11px] text-white/40 leading-tight">Narrator</p>
                  </div>
                </Link>

                {/* Co-narrators */}
                {coNarratorNames.map(name => {
                  const detail = coNarratorDetails.find(d => d.name === name);
                  const initials = getInitials(name);
                  const color = avatarColor(name);
                  return (
                    <div key={name} className="flex items-center gap-3">
                      <div className={`relative h-11 w-11 rounded-full overflow-hidden border border-white/15 shrink-0 flex items-center justify-center ${!detail?.photo ? color : ""}`}>
                        {detail?.photo ? (
                          <Image
                            src={detail.photo}
                            alt={name}
                            fill
                            className="object-cover"
                            sizes="44px"
                          />
                        ) : (
                          <span className="text-xs font-bold text-white/80">{initials}</span>
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white leading-tight">{name}</p>
                        <p className="text-[11px] text-white/40 leading-tight">Co-Narrator</p>
                      </div>
                    </div>
                  );
                })}

              </div>
            </div>
            {/* ────────────────────────────────────────────────────────── */}

            {/* CTAs */}
            <div className="flex flex-wrap gap-3">
              {isReleased && book.audible_link && (
                <a href={book.audible_link} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 bg-[#D4AF37] text-black font-bold px-6 py-3 rounded-full hover:bg-[#E0C15A] transition-colors text-sm">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5.14v13.72l11-6.86L8 5.14z"/>
                  </svg>
                  Listen on Audible
                </a>
              )}
              {isReleased && book.ar_link && (
                <a href={book.ar_link} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 border border-white/20 text-white/70 hover:text-white hover:border-white/40 font-semibold px-6 py-3 rounded-full transition-colors text-sm">
                  Authors Republic
                </a>
              )}
              <Link href="/contact"
                className="inline-flex items-center gap-2 border border-[#D4AF37]/40 text-[#D4AF37] hover:bg-[#D4AF37]/10 font-semibold px-6 py-3 rounded-full transition-colors text-sm">
                Request a quote
              </Link>
            </div>

          </div>
        </div>

        {/* Bottom CTA */}
        <div className="mt-16 border-t border-white/8 pt-10 flex flex-col sm:flex-row items-center justify-between gap-4">
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
