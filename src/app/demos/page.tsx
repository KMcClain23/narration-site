import type { Metadata } from "next";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { DemosGrid, type PublicDemo } from "./DemosGrid";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Demos | Dean Miller Narration",
  description:
    "Audiobook narration demos by Dean Miller. Dark romance, romantasy, drama, thriller, LGBTQ+ fiction and contemporary romance.",
};

export default async function DemosPage() {
  let demos: PublicDemo[] = [];
  try {
    const { data } = await supabaseAdmin
      .from("demos")
      .select("id,title,genre,description,file_url,duration_seconds")
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (data) demos = data as PublicDemo[];
  } catch { /* DB unavailable */ }

  return (
    <main className="min-h-screen bg-[#06082E] text-white pt-28 pb-24 px-5 sm:px-6">
      <div className="max-w-5xl mx-auto">
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-5">
            <div className="h-px w-8 bg-[#D4AF37]" />
            <p className="text-[11px] uppercase tracking-[0.3em] text-[#D4AF37]">Dean Miller Narration</p>
          </div>

          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">Narration demos</h1>

          {/* No genre list in the sentence: the filter chips below name every
              genre with a count, which does the matching job better than prose
              and cannot go stale as demos are added. */}
          <p className="mt-4 max-w-xl text-lg text-white/60 leading-relaxed">
            Character-driven audiobook narration for books that demand emotional depth.
          </p>
        </div>

        {demos.length === 0 ? (
          <p className="py-20 text-center text-white/30">No demos available yet.</p>
        ) : (
          <DemosGrid demos={demos} />
        )}

        {/* Was a single "Back to site" link. Someone who has just listened
            through the library is closer to hiring than anyone else on the
            site, and had nowhere to go. */}
        <div className="mt-16 flex flex-wrap items-center justify-center gap-3 border-t border-white/8 pt-10">
          <Link
            href="/#contact"
            className="inline-flex items-center gap-2 rounded-full bg-[#D4AF37] px-6 py-3 text-sm font-bold text-black transition hover:bg-[#E0C15A]"
          >
            Get in touch
          </Link>
          <Link
            href="/narrated-works"
            className="inline-flex items-center gap-2 rounded-full border border-[#D4AF37]/50 px-5 py-3 text-sm text-[#D4AF37] transition-colors hover:bg-[#D4AF37]/10"
          >
            Browse the full portfolio
          </Link>
        </div>
      </div>
    </main>
  );
}
