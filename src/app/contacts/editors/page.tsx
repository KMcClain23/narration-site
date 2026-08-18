import { AdminLayout } from "@/components/admin/AdminLayout";
import { adminType } from "@/lib/design-tokens";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ContactsSubNav } from "@/components/contacts/ContactsSubNav";
import { EditorsListClient, type EditorRow } from "@/components/contacts/EditorsListClient";
import { assertAdmin } from "@/lib/require-admin";

export const dynamic = "force-dynamic";

export default async function ContactsEditorsPage() {
  await assertAdmin();

  const [editorsRes, payoutsRes] = await Promise.all([
    supabaseAdmin
      .from("editors")
      .select("id, name, email, venmo, paypal, role, notes")
      .order("name", { ascending: true }),
    // payment_payouts.payee_name is free text with no FK, so the history is
    // matched by name here rather than joined — the same convention authors
    // and co-narrators use against board_cards. A renamed contact silently
    // loses its history, which is why the name carries a unique index.
    supabaseAdmin
      .from("payment_payouts")
      .select("payee_name, amount, paid_on"),
  ]);

  const stats = new Map<string, { paid: number; owed: number; jobs: number }>();
  for (const p of payoutsRes.data ?? []) {
    const key = (p.payee_name ?? "").trim().toLowerCase();
    if (!key) continue;
    const s = stats.get(key) ?? { paid: 0, owed: 0, jobs: 0 };
    const amount = Number(p.amount) || 0;
    s.jobs += 1;
    if (p.paid_on) s.paid += amount;
    else s.owed += amount;
    stats.set(key, s);
  }

  const rows: EditorRow[] = (editorsRes.data ?? []).map(e => {
    const s = stats.get(e.name.trim().toLowerCase());
    return {
      id: e.id,
      name: e.name,
      email: e.email ?? "",
      venmo: e.venmo ?? "",
      paypal: e.paypal ?? "",
      role: e.role ?? "editor",
      notes: e.notes ?? "",
      jobs: s?.jobs ?? 0,
      paid: s?.paid ?? 0,
      owed: s?.owed ?? 0,
    };
  });

  return (
    <AdminLayout>
      <ContactsSubNav />
      <h1 className={adminType.titleLg}>Editors</h1>
      <p className={`${adminType.small} mt-1`}>
        Who edits and proofs the books, how to reach them, and how they get paid.
      </p>
      <EditorsListClient initialRows={rows} />
    </AdminLayout>
  );
}
