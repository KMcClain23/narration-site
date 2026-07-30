import { AdminLayout } from "@/components/admin/AdminLayout";
import { adminType } from "@/lib/design-tokens";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sanitizeName } from "@/lib/sanitize-name";
import { AuthorsListClient, type AuthorRow } from "@/components/contacts/AuthorsListClient";

// Admin data changes constantly and staleness has zero acceptable UX here —
// unlike the public site's ISR-cached pages, this always reads fresh from
// Supabase on every request.
export const dynamic = "force-dynamic";

export default async function ContactsAuthorsPage() {
  const [authorsRes, cardsRes] = await Promise.all([
    supabaseAdmin.from("authors").select("id, name, email, bio, photo_url").order("name", { ascending: true }),
    // Only the fields needed to compute book count / last activity per author.
    // NOTE: authors link to board_cards by name-string match (no FK) — see
    // the matching comment in the profile page for the exact caveats.
    supabaseAdmin.from("board_cards").select("author, updated_at"),
  ]);

  const authors = authorsRes.data ?? [];
  const cards = cardsRes.data ?? [];

  // Case-insensitive, trimmed name match — same convention as the existing
  // emailByName lookup in board/page.tsx. A renamed author or a typo in
  // board_cards.author silently drops out of these stats; there is no FK.
  const statsByName = new Map<string, { count: number; lastActivity: string | null }>();
  for (const c of cards) {
    if (!c.author) continue;
    const key = c.author.trim().toLowerCase();
    const existing = statsByName.get(key) ?? { count: 0, lastActivity: null };
    existing.count += 1;
    if (!existing.lastActivity || (c.updated_at && c.updated_at > existing.lastActivity)) {
      existing.lastActivity = c.updated_at;
    }
    statsByName.set(key, existing);
  }

  const rows: AuthorRow[] = authors.map(a => {
    const stats = statsByName.get(a.name.trim().toLowerCase());
    return {
      id: a.id,
      slug: sanitizeName(a.name),
      name: a.name,
      email: a.email ?? "",
      bio: a.bio ?? "",
      photo_url: a.photo_url,
      bookCount: stats?.count ?? 0,
      lastActivity: stats?.lastActivity ?? null,
    };
  });

  return (
    <AdminLayout>
      <div className="mx-auto max-w-[1200px]">
        <div className="flex items-center justify-between">
          <h1 className={adminType.titleLg}>
            Authors <span className="text-text-muted">({rows.length})</span>
          </h1>
        </div>
        <div className="mt-6">
          <AuthorsListClient initialRows={rows} />
        </div>
      </div>
    </AdminLayout>
  );
}
