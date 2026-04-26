import { Redis } from "@upstash/redis";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import LogoutButton from "./LogoutButton";
import QuickLinks from "./QuickLinks";
import AuthorManager from "./AuthorManager";
import CoNarratorManager from "./CoNarratorManager";
import TestimonialQueue from "./TestimonialQueue";

export const dynamic = "force-dynamic";

const COOKIE_NAME = "dmn_admin_key";
const INQUIRY_KEY = "dmn_inquiries";

const redis = new Redis({
  url: process.env.KV_REST_API_URL ?? "",
  token: process.env.KV_REST_API_TOKEN ?? "",
});

export default async function AdminStatsPage() {
  const secret = String(process.env.ADMIN_SECRET_KEY ?? "").trim();
  const cookieStore = await cookies();
  const cookieKey = String(cookieStore.get(COOKIE_NAME)?.value ?? "").trim();

  if (!cookieKey || cookieKey !== secret) return notFound();

  // --- FETCH DATA ---
  const totalPlays = (await redis.get<number>("total_demo_plays")) ?? 0;
  const rawInquiries = await redis.lrange(INQUIRY_KEY, 0, -1);
  const inquiries = rawInquiries.map((i: any) => (typeof i === 'string' ? JSON.parse(i) : i));

  // --- ACTIONS ---
  async function deleteInquiry(formData: FormData) {
    "use server";
    const id = formData.get("id");
    const raw = await redis.lrange(INQUIRY_KEY, 0, -1);
    for (const item of raw) {
      const inquiry = typeof item === 'string' ? JSON.parse(item) : item;
      if (inquiry.id === id) {
        await redis.lrem(INQUIRY_KEY, 1, JSON.stringify(inquiry));
        break;
      }
    }
    revalidatePath("/admin/stats");
  }

  return (
    <main className="min-h-screen bg-[#06082E] text-white p-6 pt-24 md:p-12 md:pt-24">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
          <a href="/admin/login"
            className="inline-flex items-center gap-2 text-sm font-bold text-[#D4AF37] border border-[#D4AF37]/30 px-4 py-2 rounded-full hover:bg-[#D4AF37]/10 transition-colors">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            Manage Books
          </a>
          <LogoutButton />
        </div>
        <div className="flex items-center justify-between border-b border-[#1A2550] pb-8">
          <h1 className="text-4xl font-bold text-[#D4AF37]">Dean Miller Admin</h1>
        </div>

        {/* 1. INBOX: NARRATION REQUESTS */}
        <section className="mt-12">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-semibold text-white">Inquiries Inbox</h2>
            <span className="bg-[#D4AF37]/20 text-[#D4AF37] text-xs px-3 py-1 rounded-full font-bold">
              {inquiries.length} Messages
            </span>
          </div>

          <div className="grid gap-4">
            {inquiries.map((inquiry: any) => (
              <div key={inquiry.id} className="bg-[#0B1224] border border-[#1A2550] p-6 rounded-2xl shadow-xl hover:border-[#D4AF37]/30 transition">
                <div className="flex flex-wrap justify-between items-start gap-4">
                  <div>
                    <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded ${
                      inquiry.role === 'Author' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'
                    }`}>
                      {inquiry.role}
                    </span>
                    <h3 className="text-lg font-bold mt-2">{inquiry.name}</h3>
                    <p className="text-sm text-[#D4AF37]">{inquiry.email}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-white/30 uppercase font-mono">
                      {new Date(inquiry.createdAt).toLocaleDateString()}
                    </p>
                    <form action={deleteInquiry} className="mt-2">
                      <input type="hidden" name="id" value={inquiry.id} />
                      <button className="text-xs text-red-400/50 hover:text-red-400 transition underline">
                        Archive
                      </button>
                    </form>
                  </div>
                </div>
                <div className="mt-4 p-4 bg-[#06082E] rounded-lg border border-[#1A2550]/50 text-white/80 text-sm leading-relaxed">
                  {inquiry.message}
                </div>
              </div>
            ))}
            {inquiries.length === 0 && (
              <div className="text-center py-20 bg-[#0B1224] rounded-2xl border border-dashed border-[#1A2550]">
                <p className="text-white/20 italic">No new inquiries from authors or narrators.</p>
              </div>
            )}
          </div>
        </section>

        {/* 2. AUTHOR PROFILES */}
        <AuthorManager />

        {/* 3. CO-NARRATOR PROFILES */}
        <CoNarratorManager />

        {/* 4. TESTIMONIAL QUEUE */}
        <TestimonialQueue />

        {/* 5. QUICK ANALYTICS */}
        <section className="mt-12 pt-12 border-t border-[#1A2550]">
          <div className="bg-[#0B1224] border border-[#1A2550] rounded-2xl p-8 inline-block">
            <p className="text-white/30 text-[10px] uppercase tracking-[0.2em] font-bold">Total Demo Plays</p>
            <p className="mt-2 text-5xl font-mono text-white">{totalPlays.toLocaleString()}</p>
          </div>
        </section>
      </div>
    </main>
  );
}