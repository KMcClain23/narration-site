import { notFound } from "next/navigation";
import { FaAmazon, FaInstagram, FaTiktok, FaThreads, FaFacebook, FaGoodreads } from "react-icons/fa6";
import { Globe, Mail, MapPin, MessageCircle } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { adminType } from "@/lib/design-tokens";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sanitizeName } from "@/lib/sanitize-name";
import { PersonAvatar } from "@/components/PersonAvatar";
import { AuthorProfileEditButton } from "@/components/contacts/AuthorProfileEditButton";
import { BooksTogetherSection } from "@/components/contacts/BooksTogetherSection";
import { ContactsSubNav } from "@/components/contacts/ContactsSubNav";
import type { Person } from "@/components/admin/PersonForm";

// Admin data changes constantly and staleness has zero acceptable UX here —
// unlike the public site's ISR-cached pages, this always reads fresh from
// Supabase on every request.
export const dynamic = "force-dynamic";

const SOCIAL_LINKS: { key: keyof Person; label: string; Icon: typeof FaAmazon }[] = [
  { key: "amazon", label: "Amazon", Icon: FaAmazon },
  { key: "instagram", label: "Instagram", Icon: FaInstagram },
  { key: "tiktok", label: "TikTok", Icon: FaTiktok },
  { key: "threads", label: "Threads", Icon: FaThreads },
  { key: "facebook", label: "Facebook", Icon: FaFacebook },
  { key: "goodreads", label: "Goodreads", Icon: FaGoodreads },
];

export default async function AuthorProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const { data: authors } = await supabaseAdmin.from("authors").select("*");
  const author = (authors ?? []).find(a => sanitizeName(a.name) === slug);
  if (!author) notFound();

  // Books-together: board_cards has no FK to authors — the link is a
  // case-insensitive, trimmed name-string match, same convention as the
  // existing emailByName lookup in board/page.tsx. A renamed author or a
  // typo in board_cards.author silently orphans a book from this list;
  // same-name authors would share one list. A proper FK is future work
  // (candidate for Stage 7 cleanup), not in scope here.
  const { data: allCards } = await supabaseAdmin
    .from("board_cards")
    .select("id, title, cover_url, status, created_at, archived_at, deadline, released_at")
    .eq("author", author.name); // exact match fast-path; see fallback below

  // Exact match may miss case/whitespace variants — fall back to a full
  // scan + trimmed/lowercased comparison, matching the app-wide convention.
  let books = allCards ?? [];
  if (books.length === 0) {
    const { data: everything } = await supabaseAdmin
      .from("board_cards")
      .select("id, title, cover_url, status, created_at, archived_at, deadline, released_at, author");
    const target = author.name.trim().toLowerCase();
    books = (everything ?? []).filter(c => c.author?.trim().toLowerCase() === target);
  }
  books = [...books].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const person: Person = {
    id: author.id,
    name: author.name,
    email: author.email ?? "",
    bio: author.bio ?? "",
    website: author.website ?? "",
    amazon: author.amazon ?? "",
    instagram: author.instagram ?? "",
    tiktok: author.tiktok ?? "",
    threads: author.threads ?? "",
    facebook: author.facebook ?? "",
    goodreads: author.goodreads ?? "",
    photo_url: author.photo_url ?? null,
    location: author.location ?? "",
    preferred_contact: author.preferred_contact ?? "",
    genres: author.genres ?? [],
    skills: [], // not an author field — shared Person shape requires it structurally
    representation: "", // not an author field — shared Person shape requires it structurally
    notes: author.notes ?? "",
    // Production-company-only fields — not applicable to authors.
    label: "", status: "", address: "", contact_info: "", finding_source: "",
    date_contacted: "", next_contact_date: "", job_titles: [], contact_names: [],
  };

  return (
    <AdminLayout>
      <div className="mx-auto max-w-[1200px]">
        <ContactsSubNav />
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Left column */}
          <div className="lg:col-span-1">
            <PersonAvatar name={person.name} photoUrl={person.photo_url} size={200} />

            <h1 className={`${adminType.titleLg} mt-4`}>{person.name}</h1>

            {!person.bio && (
              <p className="mt-1 text-[13px] font-medium text-accent-amber-bright">Missing bio</p>
            )}

            <div className="mt-4 space-y-2.5">
              {person.location && (
                <div className="flex items-center gap-2 text-sm text-text-body">
                  <MapPin size={14} className="shrink-0 text-text-dim" /> {person.location}
                </div>
              )}
              {person.website && (
                <a
                  href={person.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-text-body hover:text-text-primary"
                >
                  <Globe size={14} className="shrink-0 text-text-dim" /> {person.website}
                </a>
              )}
              {person.preferred_contact && (
                <div className="flex items-center gap-2 text-sm text-text-body">
                  <MessageCircle size={14} className="shrink-0 text-text-dim" /> {person.preferred_contact}
                </div>
              )}
              {person.email && (
                <a
                  href={`mailto:${person.email}`}
                  className="flex items-center gap-2 text-sm text-text-body hover:text-text-primary"
                >
                  <Mail size={14} className="shrink-0 text-text-dim" /> {person.email}
                </a>
              )}
            </div>

            <div className="mt-5">
              <AuthorProfileEditButton person={person} />
            </div>
          </div>

          {/* Right column */}
          <div className="lg:col-span-2">
            {person.bio && <p className={`${adminType.bodyMd} leading-relaxed text-text-body`}>{person.bio}</p>}

            {person.genres.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {person.genres.map(g => (
                  <span
                    key={g}
                    className="rounded bg-pill-neutral-bg px-2 py-0.5 text-[12px] uppercase tracking-wide text-pill-neutral-text"
                  >
                    {g}
                  </span>
                ))}
              </div>
            )}

            <BooksTogetherSection books={books} />

            {/* Social links */}
            {SOCIAL_LINKS.some(({ key }) => person[key]) && (
              <div className="mt-8">
                <p className={adminType.title}>Social</p>
                <div className="mt-3 flex flex-wrap gap-4">
                  {SOCIAL_LINKS.filter(({ key }) => person[key]).map(({ key, label, Icon }) => (
                    <a
                      key={key}
                      href={String(person[key])}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-sm text-text-body hover:text-text-primary"
                      title={label}
                    >
                      <Icon size={15} />
                      <span className="max-w-[220px] truncate">{String(person[key])}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Notes */}
            {person.notes && (
              <div className="mt-8">
                <p className={adminType.title}>Notes</p>
                <p className={`${adminType.body} mt-2 whitespace-pre-wrap`}>{person.notes}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
