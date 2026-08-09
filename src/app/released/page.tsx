import { AdminLayout } from "@/components/admin/AdminLayout";
import { ReleasedClient } from "./ReleasedClient";
import { assertAdmin } from "@/lib/require-admin";

// Admin data changes constantly — always read fresh, same convention as the
// other admin pages.
export const dynamic = "force-dynamic";

export default async function ReleasedPage() {
  await assertAdmin();
  return (
    <AdminLayout>
      <ReleasedClient />
    </AdminLayout>
  );
}
