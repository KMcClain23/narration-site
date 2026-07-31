import { notFound } from "next/navigation";
import { Globe, MapPin, MessageCircle, Calendar } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { adminType } from "@/lib/design-tokens";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sanitizeName } from "@/lib/sanitize-name";
import { statusMeta, isOverdue, formatDateSafe, zipRoster, realGenres, genreNotes } from "@/lib/production-contacts-constants";
import { ProductionCompanyActions } from "@/components/contacts/ProductionCompanyActions";
import type { Person } from "@/components/admin/PersonForm";

// Admin data changes constantly and staleness has zero acceptable UX here —
// unlike the public site's ISR-cached pages, this always reads fresh from
// Supabase on every request.
export const dynamic = "force-dynamic";

function StatusPill({ value }: { value: string }) {
  const s = statusMeta(value);
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest ${s.bg} ${s.border} ${s.text}`}>
      {s.label}
    </span>
  );
}

export default async function ProductionCompanyProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const { data: companies } = await supabaseAdmin.from("production_contacts").select("*");
  const row = (companies ?? []).find(c => sanitizeName(c.company ?? "") === slug);
  if (!row) notFound();

  const person: Person = {
    id: String(row.id),
    name: row.company ?? "",
    email: "", bio: "", website: row.website ?? "",
    amazon: "", instagram: "", tiktok: "", threads: "", facebook: "", goodreads: "",
    photo_url: null,
    location: "", preferred_contact: row.preferred_contact ?? "",
    genres: row.genres ?? [], skills: [], representation: "", notes: row.notes ?? "",
    label: row.label ?? "", status: row.status ?? "", address: row.address ?? "",
    contact_info: row.contact_info ?? "", finding_source: row.finding_source ?? "",
    date_contacted: row.date_contacted ?? "", next_contact_date: row.next_contact_date ?? "",
    job_titles: row.job_titles ?? [], contact_names: row.contact_names ?? [],
  };

  const dateContacted = person.date_contacted || null;
  const nextContact = person.next_contact_date || null;
  const roster = zipRoster(person.contact_names, person.job_titles, person.name);
  const hasRoster = roster.some(r => r.name || r.jobTitle);
  const genres = realGenres(person.genres);
  const gNotes = genreNotes(person.genres);

  return (
    <AdminLayout>
      <div className="mx-auto max-w-[900px]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className={adminType.titleLg}>{person.name}</h1>
            {person.label && <p className="mt-0.5 text-sm text-text-muted">{person.label}</p>}
            <div className="mt-2"><StatusPill value={person.status} /></div>

            <div className="mt-4 space-y-2.5">
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
              {person.address && (
                <div className="flex items-center gap-2 text-sm text-text-body">
                  <MapPin size={14} className="shrink-0 text-text-dim" /> {person.address}
                </div>
              )}
              {person.preferred_contact && (
                <div className="flex items-center gap-2 text-sm text-text-body">
                  <MessageCircle size={14} className="shrink-0 text-text-dim" /> {person.preferred_contact}
                </div>
              )}
            </div>
          </div>

          <ProductionCompanyActions person={person} />
        </div>

        {(genres.length > 0 || gNotes.length > 0) && (
          <div className="mt-8">
            <p className={adminType.title}>Genres</p>
            {genres.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {genres.map(g => (
                  <span key={g} className="rounded bg-pill-neutral-bg px-2 py-0.5 text-[12px] uppercase tracking-wide text-pill-neutral-text">
                    {g}
                  </span>
                ))}
              </div>
            )}
            {/* Free-text notes some contacts were tagged with instead of a
                real genre (e.g. "Roster is by invite ONLY!") — same split
                the old ContactsClient uses, shown separately from the chips. */}
            {gNotes.length > 0 && (
              <p className="mt-2 text-[13px] italic text-accent-amber-bright/70">{gNotes.join(" · ")}</p>
            )}
          </div>
        )}

        {hasRoster && (
          <div className="mt-8">
            <p className={adminType.title}>Contact people</p>
            {/* job_titles and contact_names are two independent text[] columns
                with no shared key beyond array position — a stopgap until the
                schema is properly modernized into a real roster table
                (Stage 8+ per the Stage 4.3 plan). */}
            <div className="mt-3 overflow-hidden rounded-lg border border-surface-border">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-surface-border bg-surface">
                    <th className={`px-4 py-2 text-left ${adminType.label}`}>Name</th>
                    <th className={`px-4 py-2 text-left ${adminType.label}`}>Job title</th>
                  </tr>
                </thead>
                <tbody>
                  {roster.map((r, i) => (
                    <tr key={i} className="border-b border-surface-border last:border-0">
                      <td className="px-4 py-2 text-text-body">{r.name || "—"}</td>
                      <td className="px-4 py-2 text-text-body">{r.jobTitle || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {person.contact_info && (
          <div className="mt-8">
            <p className={adminType.title}>Contact info</p>
            <p className={`${adminType.body} mt-2 whitespace-pre-wrap`}>{person.contact_info}</p>
          </div>
        )}

        {person.finding_source && (
          <div className="mt-8">
            <p className={adminType.title}>Finding source</p>
            <p className={`${adminType.body} mt-2`}>{person.finding_source}</p>
          </div>
        )}

        {(dateContacted || nextContact) && (
          <div className="mt-8">
            <p className={adminType.title}>Dates</p>
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2 text-sm text-text-body">
                <Calendar size={14} className="shrink-0 text-text-dim" />
                <span className={adminType.label}>Last contacted:</span>
                {dateContacted ? formatDateSafe(dateContacted) : "—"}
              </div>
              <div className={`flex items-center gap-2 text-sm ${nextContact && isOverdue(nextContact) ? "font-medium text-alert-red" : "text-text-body"}`}>
                <Calendar size={14} className="shrink-0 text-text-dim" />
                <span className={adminType.label}>Next contact:</span>
                {nextContact ? formatDateSafe(nextContact) : "—"}
              </div>
            </div>
          </div>
        )}

        {person.notes && (
          <div className="mt-8">
            <p className={adminType.title}>Notes</p>
            <p className={`${adminType.body} mt-2 whitespace-pre-wrap`}>{person.notes}</p>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
