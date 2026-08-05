import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { PrepperClient, type ManuscriptRow } from "@/components/admin/prepper/PrepperClient";

// Admin data changes constantly — always read fresh, same convention as the
// other /tools pages.
export const dynamic = "force-dynamic";

export default async function PrepperPage() {
  const { data: manuscripts } = await supabaseAdmin
    .from("manuscripts")
    .select("id, title, author, status, source_format, created_at")
    .order("created_at", { ascending: false });

  const manuscriptIds = (manuscripts ?? []).map((m) => m.id);
  const { data: chapterRows } = manuscriptIds.length
    ? await supabaseAdmin.from("chapters").select("manuscript_id").in("manuscript_id", manuscriptIds)
    : { data: [] };

  const chapterCountByManuscript = new Map<string, number>();
  (chapterRows ?? []).forEach((c) => {
    chapterCountByManuscript.set(c.manuscript_id, (chapterCountByManuscript.get(c.manuscript_id) ?? 0) + 1);
  });

  const rows: ManuscriptRow[] = (manuscripts ?? []).map((m) => ({
    id: m.id,
    title: m.title,
    author: m.author,
    status: m.status as ManuscriptRow["status"],
    source_format: m.source_format as ManuscriptRow["source_format"],
    created_at: m.created_at,
    chapterCount: chapterCountByManuscript.get(m.id) ?? 0,
  }));

  return (
    <AdminLayout>
      <div className="mx-auto max-w-[1000px]">
        <PrepperClient initialManuscripts={rows} />
      </div>
    </AdminLayout>
  );
}
