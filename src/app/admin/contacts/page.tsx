import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import ContactsClient from "./ContactsClient";
import rawContacts from "@/data/contacts.json";

export const dynamic = "force-dynamic";

const COOKIE_NAME = "dmn_admin_key";

export default async function ContactsPage() {
  const secret     = String(process.env.ADMIN_SECRET_KEY ?? "").trim();
  const cookieStore = await cookies();
  const cookieKey  = String(cookieStore.get(COOKIE_NAME)?.value ?? "").trim();
  if (!cookieKey || cookieKey !== secret) return notFound();

  return (
    <main className="min-h-screen bg-[#06082E] text-white p-6 pt-24 md:p-12 md:pt-24">
      <div className="max-w-7xl mx-auto">

        {/* Nav */}
        <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <a href="/admin/analytics"
              className="inline-flex items-center gap-2 text-sm font-bold text-white/60 border border-white/15 px-4 py-2 rounded-full hover:bg-white/5 transition-colors">
              Analytics
            </a>
            <a href="/admin/stats"
              className="inline-flex items-center gap-2 text-sm font-bold text-white/60 border border-white/15 px-4 py-2 rounded-full hover:bg-white/5 transition-colors">
              Stats
            </a>
            <Link href="/board"
              className="inline-flex items-center gap-2 text-sm font-bold text-[#D4AF37] border border-[#D4AF37]/30 px-4 py-2 rounded-full hover:bg-[#D4AF37]/10 transition-colors">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"/>
              </svg>
              Production Board
            </Link>
          </div>
        </div>

        {/* Header */}
        <div className="flex items-center gap-4 border-b border-[#1A2550] pb-8 mb-8">
          <h1 className="text-4xl font-bold text-[#D4AF37]">Production Contacts</h1>
          <span className="text-sm font-bold text-white/40 bg-white/5 border border-white/10 px-3 py-1 rounded-full">
            {rawContacts.length}
          </span>
        </div>

        <ContactsClient contacts={rawContacts as Parameters<typeof ContactsClient>[0]["contacts"]} />
      </div>
    </main>
  );
}
