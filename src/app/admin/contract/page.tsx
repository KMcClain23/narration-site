import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import ContractClient from "./ContractClient";

export const dynamic = "force-dynamic";

export default async function ContractPage() {
  const cookieStore = await cookies();
  const key = String(cookieStore.get("dmn_admin_key")?.value ?? "").trim();
  const secret = String(process.env.ADMIN_SECRET_KEY ?? "").trim();
  if (!key || key !== secret) return notFound();
  return <ContractClient />;
}
