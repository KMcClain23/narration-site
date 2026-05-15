import { Redis } from "@upstash/redis";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import LogoutButton from "./LogoutButton";
import QuickLinks from "./QuickLinks";
import AuthorManager from "./AuthorManager";
import CoNarratorManager from "./CoNarratorManager";
import TestimonialQueue from "./TestimonialQueue";
import AvailabilityToggle from "./AvailabilityToggle";
import BookingAvailability from "./BookingAvailability";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const COOKIE_NAME = "dmn_admin_key";
const INQUIRY_KEY = "dmn_inquiries";
const ARCHIVE_KEY = "dmn_inquiries_archived";

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
  const { data: settingRow } = await supabaseAdmin
    .from("site_settings").select("value").eq("key", "accepting_projects").single();
  const acceptingProjects = settingRow?.value !== "false";

  const { data: monthsRow } = await supabaseAdmin
    .from("site_settings").select("value").eq("key", "available_months").single();
  let availableMonths: number[] = [8, 9, 10, 11];
  try { if (monthsRow?.value) availableMonths = JSON.parse(monthsRow.value); } catch {}

  const { data: cardRows } = await supabaseAdmin
    .from("board_cards")
    .select("id, title, deadline, first15_due, status")
    .neq("status", "released");

  type CardRow = { id: string; title: string; deadline: string | null; first15_due: string | null; status: string };
  const datedCards: CardRow[] = (cardRows ?? []).filter(
    (c: CardRow) => c.deadline || c.first15_due
  );

  const scheduleNow = new Date();
  const monthSlots = Array.from({ length: 8 }, (_, i) => {
    const d = new Date(scheduleNow.getFullYear(), scheduleNow.getMonth() + i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const isDifferentYear = d.getFullYear() !== scheduleNow.getFullYear();
    const label = isDifferentYear
      ? d.toLocaleDateString("en-US", { month: "short", year: "2-digit" })
      : d.toLocaleDateString("en-US", { month: "short" });
    const deadlines = datedCards.filter((c: CardRow) => c.deadline?.startsWith(key));
    const first15s = datedCards.filter((c: CardRow) => c.first15_due?.startsWith(key) && !c.deadline?.startsWith(key));
    return { key, label, deadlines, first15s };
  });

  const totalPlays = (await redis.get<number>("total_demo_plays")) ?? 0;
  const rawInquiries = await redis.lrange(INQUIRY_KEY, 0, -1);
  const inquiries = rawInquiries.map((i: any) => (typeof i === 'string' ? JSON.parse(i) : i));
  const rawArchived = await redis.lrange(ARCHIVE_KEY, 0, -1);
  const archived = rawArchived.map((i: any) => (typeof i === 'string' ? JSON.parse(i) : i));

  // --- ACTIONS ---
  async function archiveInquiry(formData: FormData) {
    "use server";
    const id = formData.get("id");
    const raw = await redis.lrange(INQUIRY_KEY, 0, -1);
    for (const item of raw) {
      const inquiry = typeof item === 'string' ? JSON.parse(item) : item;
      if (inquiry.id === id) {
        await redis.lrem(INQUIRY_KEY, 1, JSON.stringify(inquiry));
        await redis.lpush(ARCHIVE_KEY, JSON.stringify({ ...inquiry, archivedAt: new Date().toISOString() }));
        break;
      }
    }
    revalidatePath("/admin/stats");
  }

  async function deleteArchivedInquiry(formData: FormData) {
    "use server";
    const id = formData.get("id");
    const raw = await redis.lrange(ARCHIVE_KEY, 0, -1);
    for (const item of raw) {
      const inquiry = typeof item === 'string' ? JSON.parse(item) : item;
      if (inquiry.id === id) {
        await redis.lrem(ARCHIVE_KEY, 1, JSON.stringify(inquiry));
        break;
      }
    }
    revalidatePath("/admin/stats");
  }

  async function restoreInquiry(formData: FormData) {
    "use server";
    const id = formData.get("id");
    const raw = await redis.lrange(ARCHIVE_KEY, 0, -1);
    for (const item of raw) {
      const inquiry = typeof item === 'string' ? JSON.parse(item) : item;
      if (inquiry.id === id) {
        await redis.lrem(ARCHIVE_KEY, 1, JSON.stringify(inquiry));
        const { archivedAt: _, ...restored } = inquiry;
        await redis.lpush(INQUIRY_KEY, JSON.stringify(restored));
        break;
      }
    }
    revalidatePath("/admin/stats");
  }

  return (
    <main className="min-h-screen bg-[#06082E] text-white p-6 pt-24 md:p-12 md:pt-24">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
          <a href="/admin/analytics"
            className="inline-flex items-center gap-2 text-sm font-bold text-white/60 border border-white/15 px-4 py-2 rounded-full hover:bg-white/5 transition-colors">
            Analytics
          </a>
          <a href="/board"
            className="inline-flex items-center gap-2 text-sm font-bold text-[#D4AF37] border border-[#D4AF37]/30 px-4 py-2 rounded-full hover:bg-[#D4AF37]/10 transition-colors">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
              </svg>
              Production Board
            </a>
          <LogoutButton />
        </div>
        <div className="flex items-center justify-between border-b border-[#1A2550] pb-8">
          <h1 className="text-4xl font-bold text-[#D4AF37]">Dean Miller Admin</h1>
        </div>

        {/* Availability toggle */}
        <div className="mt-6">
          <AvailabilityToggle initial={acceptingProjects} />
          <BookingAvailability initial={availableMonths} />
        </div>

        {/* Monthly schedule */}
        <div className="mt-4 rounded-2xl border border-[#1A2550] bg-[#0B1224] p-5">
          <p className="font-semibold text-white text-sm mb-4">Monthly Schedule</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
            {monthSlots.map(({ key, label, deadlines, first15s }) => {
              const total = deadlines.length + first15s.length;
              const isCurrent = key === `${scheduleNow.getFullYear()}-${String(scheduleNow.getMonth() + 1).padStart(2, "0")}`;
              return (
                <div key={key} className={`rounded-xl border p-2.5 min-h-[72px] ${total > 0 ? "border-[#D4AF37]/25 bg-[#0A0D3A]" : "border-white/5 bg-[#0A0D3A]/40 opacity-35"}`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${isCurrent ? "text-[#D4AF37]" : "text-white/50"}`}>{label}</span>
                    {total > 0 && (
                      <span className="text-[10px] font-bold bg-[#D4AF37]/20 text-[#D4AF37] rounded-full px-1.5 leading-4">{total}</span>
                    )}
                  </div>
                  <div className="space-y-0.5">
                    {deadlines.map(c => (
                      <a key={c.id} href={`/board/card/${c.id}`}
                        className="block text-[9px] text-white/65 truncate hover:text-white transition-colors leading-snug">
                        {c.title}
                      </a>
                    ))}
                    {first15s.map(c => (
                      <a key={c.id} href={`/board/card/${c.id}`}
                        className="flex items-center gap-0.5 text-[9px] text-[#D4AF37]/55 hover:text-[#D4AF37] transition-colors leading-snug truncate">
                        <span className="shrink-0 inline-block h-1 w-1 bg-current rounded-[1px]" style={{ transform: "rotate(45deg)" }} />
                        <span className="truncate">{c.title}</span>
                      </a>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex gap-4">
            <div className="flex items-center gap-1.5">
              <div className="h-1.5 w-3 rounded-sm bg-white/35" />
              <span className="text-[10px] text-white/30">Deadline</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 bg-[#D4AF37]/55 rounded-[1px]" style={{ transform: "rotate(45deg)" }} />
              <span className="text-[10px] text-white/30">First 15 due</span>
            </div>
          </div>
        </div>

        {/* 1. INBOX: NARRATION REQUESTS */}
        <section className="mt-12">
          <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
            <h2 className="text-2xl font-semibold text-white">Inquiries Inbox</h2>
            <div className="flex items-center gap-3">
              {archived.length > 0 && (
                <a href="/admin/stats?view=archived"
                  className="text-xs font-semibold text-white/40 hover:text-white border border-white/15 px-3 py-1.5 rounded-full transition-colors">
                  View archived ({archived.length})
                </a>
              )}
              <span className="bg-[#D4AF37]/20 text-[#D4AF37] text-xs px-3 py-1 rounded-full font-bold">
                {inquiries.length} Messages
              </span>
            </div>
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
                    <form action={archiveInquiry} className="mt-2">
                      <input type="hidden" name="id" value={inquiry.id} />
                      <button className="text-xs text-[#D4AF37]/50 hover:text-[#D4AF37] transition underline">
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

          {/* Archived messages */}
          {archived.length > 0 && (
            <div className="mt-10">
              <div className="flex items-center gap-4 mb-5">
                <h3 className="text-lg font-semibold text-white/40">Archived</h3>
                <div className="flex-1 h-px bg-white/6" />
                <span className="text-xs text-white/25">{archived.length}</span>
              </div>
              <div className="grid gap-3">
                {archived.map((inquiry: any) => (
                  <div key={inquiry.id} className="bg-[#0B1224]/50 border border-[#1A2550]/50 p-5 rounded-2xl opacity-70 hover:opacity-100 transition">
                    <div className="flex flex-wrap justify-between items-start gap-4">
                      <div>
                        <h3 className="font-semibold text-white/70">{inquiry.name}</h3>
                        <p className="text-sm text-[#D4AF37]/60">{inquiry.email}</p>
                        {inquiry.archivedAt && (
                          <p className="text-[10px] text-white/25 mt-1">
                            Archived {new Date(inquiry.archivedAt).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-3">
                        <form action={restoreInquiry}>
                          <input type="hidden" name="id" value={inquiry.id} />
                          <button className="text-xs text-emerald-400/50 hover:text-emerald-400 transition underline">
                            Restore
                          </button>
                        </form>
                        <form action={deleteArchivedInquiry}>
                          <input type="hidden" name="id" value={inquiry.id} />
                          <button className="text-xs text-red-400/40 hover:text-red-400 transition underline">
                            Delete
                          </button>
                        </form>
                      </div>
                    </div>
                    <div className="mt-3 p-3 bg-[#06082E]/50 rounded-lg border border-[#1A2550]/30 text-white/50 text-xs leading-relaxed line-clamp-3">
                      {inquiry.message}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
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