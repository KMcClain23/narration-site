import { AdminLayout } from "@/components/admin/AdminLayout";
import { ReleasedClient } from "./ReleasedClient";

// Admin data changes constantly — always read fresh, same convention as the
// other admin pages.
export const dynamic = "force-dynamic";

export default function ReleasedPage() {
  return (
    <AdminLayout>
      <ReleasedClient />
    </AdminLayout>
  );
}
