import { AdminLayout } from "@/components/admin/AdminLayout";
import ContractClient from "./ContractClient";
import { assertAdmin } from "@/lib/require-admin";

export default async function ToolsContractBuilderPage() {
  await assertAdmin();
  return (
    <AdminLayout>
      <ContractClient />
    </AdminLayout>
  );
}
