import { notFound } from "next/navigation";
import { FaAmazon, FaInstagram, FaTiktok, FaFacebook, FaGoodreads } from "react-icons/fa6";
import { Globe, Mail, MapPin, MessageCircle, Briefcase } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { adminType } from "@/lib/design-tokens";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sanitizeName } from "@/lib/sanitize-name";
import { parseCoNarrators } from "@/components/admin/board-card-utils";
import { PersonAvatar } from "@/components/PersonAvatar";
import { CoNarratorProfileEditButton } from "@/components/contacts/CoNarratorProfileEditButton";
import { BooksTogetherSection } from "@/components/contacts/BooksTogetherSection";
import { ContactsSubNav } from "@/components/contacts/ContactsSubNav";
import type { Person } from "@/components/admin/PersonForm";

// Admin data changes constantly and staleness has zero acceptable UX here —
// unlike the public site's ISR-cached pages, this always reads fresh from
// Supabase on every request.
export const dynamic = "force-dynamic";

// No Threads here — co_narrators has no threads column (confirmed absent;
// narrators are less active there than authors, per design decision).
const SOCIAL_LINKS: { key: keyof Person; label: string; Icon: typeof FaAmazon }[] = [
  { key: "amazon", label: "Amazon", Icon: FaAmazon },
  { key: "instagram", label: "Instagram", Icon: FaInstagram },
  { key: "tiktok", label: "TikTok", Icon: FaTiktok },
  { key: "facebook", label: "Facebook", Icon: FaFacebook },
  { key: "goodreads", label: "Goodreads", Icon: FaGoodreads },
];

export default async function CoNarratorProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const { data: coNarrators } = await supabaseAdmin.from("co_narrators").select("*");
  const coNarrator = (coNarrators ?? []).find(cn => sanitizeName(cn.name) === slug);
  if (!coNarrator) notFound();

  // Books-together: board_cards.co_narrator is a text column holding a
  // JSON-encoded array string (occasionally a bare non-JSON string) — NOT a
  // native Postgres array, so there is no DB-level containment operator to
  // filter on. Every row is fetched and parsed in JS via parseCoNarrators,
  // then matched case-insensitively/trimmed against this co-narrator's name
  // — same convention as the author/board_cards.author string match. A
  // renamed co-narrator or a typo in board_cards.co_narrator silently
  // orphans a book from this list; same-name co-narrators would share one
  // list. A proper FK (or normalizing this column to a real array/join
  // table) is future work (candidate for Stage 7 cleanup), not in scope here.
  const { data: allCards } = await supabaseAdmin
    .from("board_cards")
    .select("id, title, cover_url, status, created_at, archived_at, deadline, released_at, narration_format, co_narrator");

  const target = coNarrator.name.trim().toLowerCase();
  let books = (allCards ?? []).filter(c => parseCoNarrators(c.co_narrator).some(n => n.trim().toLowerCase() === target));
  books = [...books].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const person: Person = {
    id: coNarrator.id,
    name: coNarrator.name,
    email: coNarrator.email ?? "",
    bio: coNarrator.bio ?? "",
    website: coNarrator.website ?? "",
    amazon: coNarrator.amazon ?? "",
    instagram: coNarrator.instagram ?? "",
    tiktok: coNarrator.tiktok ?? "",
    threads: "", // co_narrators has no threads column
    facebook: coNarrator.facebook ?? "",
    goodreads: coNarrator.goodreads ?? "",
    photo_url: coNarrator.photo_url ?? null,
    location: coNarrator.location ?? "",
    preferred_contact: coNarrator.preferred_contact ?? "",
    genres: [], // not a co-narrator field — shared Person shape requires it structurally
    skills: coNarrator.skills ?? [],
    representation: coNarrator.representation ?? "",
    notes: coNarrator.notes ?? "",
    // Production-company-only fields — not applicable to co-narrators.
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
              {person.representation && (
                <div className="flex items-center gap-2 text-sm text-text-body">
                  <Briefcase size={14} className="shrink-0 text-text-dim" /> {person.representation}
                </div>
              )}
            </div>

            <div className="mt-5">
              <CoNarratorProfileEditButton person={person} />
            </div>
          </div>

          {/* Right column */}
          <div className="lg:col-span-2">
            {person.bio && <p className={`${adminType.bodyMd} leading-relaxed text-text-body`}>{person.bio}</p>}

            {person.skills.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {person.skills.map(s => (
                  <span
                    key={s}
                    className="rounded bg-pill-neutral-bg px-2 py-0.5 text-[12px] uppercase tracking-wide text-pill-neutral-text"
                  >
                    {s}
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
