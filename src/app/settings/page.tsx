import { AdminLayout } from "@/components/admin/AdminLayout";
import { adminType } from "@/lib/design-tokens";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { assertAdmin } from "@/lib/require-admin";
import { StudioSettingsForm } from "@/components/settings/StudioSettingsForm";
import { settingsFromRows, SETTING_KEYS } from "@/lib/studio-settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await assertAdmin();

  const { data } = await supabaseAdmin
    .from("site_settings")
    .select("key, value")
    .in("key", Object.values(SETTING_KEYS));

  const settings = settingsFromRows(data ?? []);

  return (
    <AdminLayout>
      <div className="mx-auto max-w-[1200px]">
        <h1 className={adminType.titleLg}>Settings</h1>
        <p className={`${adminType.small} mt-1`}>
          The figures the board, the schedule and the estimates are calculated from.
        </p>
        <StudioSettingsForm initial={settings} />
      </div>
    </AdminLayout>
  );
}
