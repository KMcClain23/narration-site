import { redirect } from "next/navigation";
import { assertAdmin } from "@/lib/require-admin";

export default async function ToolsPage() {
  await assertAdmin();
  redirect("/tools/analytics");
}
