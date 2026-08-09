import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { DemosV2Client, type DemoRecord } from "@/components/demos/DemosV2Client";
import { assertAdmin } from "@/lib/require-admin";

// Admin data changes constantly and staleness has zero acceptable UX here —
// unlike the public site's ISR-cached pages, this always reads fresh.
export const dynamic = "force-dynamic";

export default async function ToolsDemosPage() {
  await assertAdmin();
  const { data } = await supabaseAdmin
    .from("demos")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  return (
    <AdminLayout>
      <DemosV2Client initialDemos={(data ?? []) as DemoRecord[]} />
    </AdminLayout>
  );
}
