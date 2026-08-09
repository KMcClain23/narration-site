import { redirect } from "next/navigation";
import { assertAdmin } from "@/lib/require-admin";

export default async function ContactsPage() {
  await assertAdmin();
  redirect("/contacts/authors");
}
