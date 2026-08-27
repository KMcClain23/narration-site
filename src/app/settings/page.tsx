import { AdminLayout } from "@/components/admin/AdminLayout";
import { adminType } from "@/lib/design-tokens";
import { assertAdmin } from "@/lib/require-admin";
import { StudioSettingsForm } from "@/components/settings/StudioSettingsForm";
import { getStudioSettings } from "@/lib/studio-settings-server";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await assertAdmin();

  // Through the one loader, like every other server surface. This page used to
  // run its own copy of the query — the fourth — and drop the error on the
  // floor, so a failed read rendered the original hardcoded constants in the
  // input boxes as though someone had chosen them.
  const read = await getStudioSettings();

  return (
    <AdminLayout>
      <div className="mx-auto max-w-[1200px]">
        <h1 className={adminType.titleLg}>Settings</h1>
        <p className={`${adminType.small} mt-1`}>
          The figures the board, the schedule and the estimates are calculated from.
        </p>
        {read.failure && (
          <p className="mt-4 rounded-lg border border-alert-red/40 bg-alert-red/10 px-4 py-3 text-[13px] text-alert-red">
            The stored settings could not be read, so none of the figures below
            are the ones the app is using: {read.failure}
          </p>
        )}
        <StudioSettingsForm initial={read} />
      </div>
    </AdminLayout>
  );
}
