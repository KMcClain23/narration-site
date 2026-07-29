import { AdminLayout } from "@/components/admin/AdminLayout";
import { PlaceholderPage } from "@/components/admin/PlaceholderPage";

export default function ReleasedPage() {
  return (
    <AdminLayout>
      <PlaceholderPage title="Released" stage={7} />
    </AdminLayout>
  );
}
