import { AdminLayout } from "@/components/admin/AdminLayout";
import { PlaceholderPage } from "@/components/admin/PlaceholderPage";
import { assertAdmin } from "@/lib/require-admin";

export default async function SettingsPage() {
  await assertAdmin();
  return (
    <AdminLayout>
      <PlaceholderPage title="Settings" stage={7} />
    </AdminLayout>
  );
}
