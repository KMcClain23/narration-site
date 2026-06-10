import { supabaseAdmin } from "@/lib/supabase-admin";
import DemosAdminClient, { type DemoRecord } from "./DemosAdminClient";

export const dynamic = "force-dynamic";

export default async function AdminDemosPage() {
  let demos: DemoRecord[] = [];

  try {
    const { data, error } = await supabaseAdmin
      .from("demos")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (!error && data) demos = data as DemoRecord[];
  } catch {
    // Table may not exist yet — client shows the SQL setup hint
  }

  return <DemosAdminClient initialDemos={demos} />;
}
