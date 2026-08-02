import { AdminLayout } from "@/components/admin/AdminLayout";
import { adminType } from "@/lib/design-tokens";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sanitizeName } from "@/lib/sanitize-name";
import { ProductionCompaniesListClient, type ProductionCompanyRow } from "@/components/contacts/ProductionCompaniesListClient";
import { ContactsSubNav } from "@/components/contacts/ContactsSubNav";

// Admin data changes constantly and staleness has zero acceptable UX here —
// unlike the public site's ISR-cached pages, this always reads fresh from
// Supabase on every request.
export const dynamic = "force-dynamic";

export default async function ContactsProductionCompaniesPage() {
  const { data } = await supabaseAdmin.from("production_contacts").select("*").order("company", { ascending: true });
  const companies = data ?? [];

  const rows: ProductionCompanyRow[] = companies.map(c => ({
    id: String(c.id),
    slug: sanitizeName(c.company ?? ""),
    company: c.company ?? "",
    label: c.label ?? "",
    status: c.status ?? "",
    genres: c.genres ?? [],
    preferred_contact: c.preferred_contact ?? "",
    date_contacted: c.date_contacted ?? null,
    next_contact_date: c.next_contact_date ?? null,
  }));

  return (
    <AdminLayout>
      <div className="mx-auto max-w-[1200px]">
        <div className="flex items-center justify-between">
          <h1 className={adminType.titleLg}>
            Production Companies <span className="text-text-muted">({rows.length})</span>
          </h1>
        </div>
        <ContactsSubNav />
        <div className="mt-6">
          <ProductionCompaniesListClient initialRows={rows} />
        </div>
      </div>
    </AdminLayout>
  );
}
