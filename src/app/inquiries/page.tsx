import { AdminLayout } from "@/components/admin/AdminLayout";
import { getActiveInquiries, getArchivedInquiries } from "@/lib/inquiries";
import { InquiriesClient } from "@/components/inquiries/InquiriesClient";
import { assertAdmin } from "@/lib/require-admin";

// Admin data changes constantly and staleness has zero acceptable UX here —
// unlike the public site's ISR-cached pages, this always reads fresh.
export const dynamic = "force-dynamic";

export default async function InquiriesPage() {
  await assertAdmin();
  const [active, archived] = await Promise.all([getActiveInquiries(), getArchivedInquiries()]);

  return (
    <AdminLayout>
      <InquiriesClient initialActive={active} initialArchived={archived} />
    </AdminLayout>
  );
}
