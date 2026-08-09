import { AdminLayout } from "@/components/admin/AdminLayout";
import { TestimonialsClient } from "@/components/tools/TestimonialsClient";
import { assertAdmin } from "@/lib/require-admin";

export default async function ToolsTestimonialsPage() {
  await assertAdmin();
  return (
    <AdminLayout>
      <div className="mx-auto max-w-[1200px]">
        <TestimonialsClient />
      </div>
    </AdminLayout>
  );
}
