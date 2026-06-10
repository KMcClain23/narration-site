import type { Metadata } from "next";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Demos — Dean Miller Narration",
  description: "Listen to audiobook narration demos by Dean Miller — dark romance, romantasy, multi-character drama, and more.",
};

type DbDemo = {
  id: string;
  title: string;
  genre: string | null;
  description: string | null;
  file_url: string;
  duration_seconds: number | null;
  sort_order: number;
};

function fmtDuration(s: number | null) {
  if (!s) return null;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default async function DemosPage() {
  let demos: DbDemo[] = [];
  try {
    const { data } = await supabaseAdmin
      .from("demos")
      .select("id,title,genre,description,file_url,duration_seconds,sort_order")
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (data) demos = data as DbDemo[];
  } catch { /* DB unavailable */ }

  return (
    <main className="min-h-screen bg-[#06082E] text-white pt-28 pb-24 px-4">
      <div className="max-w-4xl mx-auto">

        {/* Header */}
        <div className="mb-3">
          <p className="text-[11px] uppercase tracking-[0.22em] text-[#D4AF37] font-bold mb-3">
            Dean Miller Narration
          </p>
          <h1 className="text-4xl sm:text-5xl font-extrabold mb-4">Narration Demos</h1>
          <p className="text-white/50 max-w-xl leading-relaxed">
            Character-driven narration for fiction that demands emotional depth — dark romance,
            romantasy, and multi-character drama.
          </p>
        </div>

        <div className="h-px bg-gradient-to-r from-[#D4AF37]/30 via-[#D4AF37]/10 to-transparent my-10" />

        {demos.length === 0 ? (
          <p className="text-white/30 text-center py-20">No demos available yet.</p>
        ) : (
          <div className="space-y-6">
            {demos.map(demo => (
              <div key={demo.id} className="bg-[#0A0C36] border border-[#1E2660] rounded-2xl p-6">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <h2 className="text-lg font-bold">{demo.title}</h2>
                  {demo.genre && (
                    <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/20">
                      {demo.genre}
                    </span>
                  )}
                  {demo.duration_seconds && (
                    <span className="text-[11px] text-white/30 ml-auto">{fmtDuration(demo.duration_seconds)}</span>
                  )}
                </div>
                {demo.description && (
                  <p className="text-sm text-white/50 mb-4">{demo.description}</p>
                )}
                <audio controls src={demo.file_url} className="w-full h-10" style={{ accentColor: "#D4AF37" }} />
              </div>
            ))}
          </div>
        )}

        <div className="mt-16 text-center">
          <Link href="/#demos" className="text-sm text-white/30 hover:text-white/60 transition">
            ← Back to site
          </Link>
        </div>
      </div>
    </main>
  );
}
