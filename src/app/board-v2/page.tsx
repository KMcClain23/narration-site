import { AdminLayout } from "@/components/admin/AdminLayout";
import { PlaceholderPage } from "@/components/admin/PlaceholderPage";

export default function BoardV2Page() {
  return (
    <AdminLayout>
      <PlaceholderPage title="Board" stage={2} />
    </AdminLayout>
  );
}
