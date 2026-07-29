import { AdminLayout } from "@/components/admin/AdminLayout";
import { PlaceholderPage } from "@/components/admin/PlaceholderPage";

export default function DemosV2Page() {
  return (
    <AdminLayout>
      <PlaceholderPage title="Demos" stage={5} />
    </AdminLayout>
  );
}
