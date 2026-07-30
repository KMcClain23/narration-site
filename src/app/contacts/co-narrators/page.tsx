import { AdminLayout } from "@/components/admin/AdminLayout";
import { adminType } from "@/lib/design-tokens";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sanitizeName } from "@/lib/sanitize-name";
import { parseCoNarrators } from "@/components/admin/board-card-utils";
import { CoNarratorsListClient, type CoNarratorRow } from "@/components/contacts/CoNarratorsListClient";

// Admin data changes constantly and staleness has zero acceptable UX here —
// unlike the public site's ISR-cached pages, this always reads fresh from
// Supabase on every request.
export const dynamic = "force-dynamic";

export default async function ContactsCoNarratorsPage() {
  const [coNarratorsRes, cardsRes] = await Promise.all([
    supabaseAdmin.from("co_narrators").select("id, name, email, bio, photo_url").order("name", { ascending: true }),
    // board_cards.co_narrator is a text column holding a JSON-encoded array
    // string (occasionally a bare non-JSON string) — NOT a native Postgres
    // array, so matching happens in JS via parseCoNarrators, not a DB query.
    supabaseAdmin.from("board_cards").select("co_narrator, updated_at"),
  ]);

  const coNarrators = coNarratorsRes.data ?? [];
  const cards = cardsRes.data ?? [];

  // Case-insensitive, trimmed name match against each parsed co_narrator —
  // same convention as the authors/board_cards.author match. A renamed
  // co-narrator or a typo in board_cards.co_narrator silently drops out of
  // these stats; there is no FK.
  const statsByName = new Map<string, { count: number; lastActivity: string | null }>();
  for (const c of cards) {
    for (const name of parseCoNarrators(c.co_narrator)) {
      const key = name.trim().toLowerCase();
      const existing = statsByName.get(key) ?? { count: 0, lastActivity: null };
      existing.count += 1;
      if (!existing.lastActivity || (c.updated_at && c.updated_at > existing.lastActivity)) {
        existing.lastActivity = c.updated_at;
      }
      statsByName.set(key, existing);
    }
  }

  const rows: CoNarratorRow[] = coNarrators.map(cn => {
    const stats = statsByName.get(cn.name.trim().toLowerCase());
    return {
      id: cn.id,
      slug: sanitizeName(cn.name),
      name: cn.name,
      email: cn.email ?? "",
      bio: cn.bio ?? "",
      photo_url: cn.photo_url,
      bookCount: stats?.count ?? 0,
      lastActivity: stats?.lastActivity ?? null,
    };
  });

  return (
    <AdminLayout>
      <div className="mx-auto max-w-[1200px]">
        <div className="flex items-center justify-between">
          <h1 className={adminType.titleLg}>
            Co-Narrators <span className="text-text-muted">({rows.length})</span>
          </h1>
        </div>
        <div className="mt-6">
          <CoNarratorsListClient initialRows={rows} />
        </div>
      </div>
    </AdminLayout>
  );
}
