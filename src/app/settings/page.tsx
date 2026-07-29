import { AdminLayout } from "@/components/admin/AdminLayout";
import { PlaceholderPage } from "@/components/admin/PlaceholderPage";

export default function SettingsPage() {
  return (
    <AdminLayout>
      <PlaceholderPage title="Settings" stage={7} />
    </AdminLayout>
  );
}
