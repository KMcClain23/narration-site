import { AdminLayout } from "@/components/admin/AdminLayout";
import { TestimonialsClient } from "@/components/tools/TestimonialsClient";

export default function ToolsTestimonialsPage() {
  return (
    <AdminLayout>
      <div className="mx-auto max-w-[1200px]">
        <TestimonialsClient />
      </div>
    </AdminLayout>
  );
}
