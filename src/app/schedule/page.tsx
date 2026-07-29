import { AdminLayout } from "@/components/admin/AdminLayout";
import { PlaceholderPage } from "@/components/admin/PlaceholderPage";

export default function SchedulePage() {
  return (
    <AdminLayout>
      <PlaceholderPage title="Schedule" stage={3} />
    </AdminLayout>
  );
}
