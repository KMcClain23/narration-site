import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { DEMOS } from "../config";
import DemoPlayerClient from "./DemoPlayerClient";

export function generateStaticParams() {
  return DEMOS.map(d => ({ slug: d.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const demo = DEMOS.find(d => d.slug === slug);
  if (!demo) return {};
  return {
    title: `${demo.title} Demo — Dean Miller Narration`,
    description: `${demo.desc}. Listen and download a free audiobook narration demo by Dean Miller.`,
  };
}

export default async function DemoDownloadPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const demo = DEMOS.find(d => d.slug === slug);
  if (!demo) notFound();

  const otherDemos = DEMOS.filter(d => d.slug !== slug);

  return (
    <main className="min-h-screen bg-[#06082E] text-white flex flex-col">
      {/* Hero content */}
      <div className="flex flex-col items-center px-5 pt-16 sm:pt-24 pb-8">
        <div className="w-full max-w-lg flex flex-col items-center gap-8">

          {/* Microphone decoration */}
          <div className="relative">
            <div className="absolute inset-0 rounded-full blur-3xl opacity-20"
              style={{ background: "radial-gradient(circle, #D4AF37 0%, transparent 70%)" }} />
            <div className="relative h-20 w-20 rounded-full border border-[#D4AF37]/20 bg-[#D4AF37]/8 flex items-center justify-center">
              <svg className="h-10 w-10 text-[#D4AF37]/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/>
              </svg>
            </div>
          </div>

          {/* Title + tags */}
          <div className="text-center">
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#D4AF37]/60 mb-2">
              Narration Demo
            </p>
            <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4">{demo.title}</h1>
            <p className="text-white/50 text-sm mb-4">{demo.desc}</p>
            {demo.tags.length > 0 && (
              <div className="flex flex-wrap justify-center gap-2">
                {demo.tags.map(tag => (
                  <span key={tag} className="text-xs px-3 py-1 rounded-full bg-white/8 text-white/50 border border-white/8">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Player */}
          <DemoPlayerClient title={demo.title} src={demo.src} color={demo.color} />

          {/* Download button */}
          <a
            href={`/api/download-demo?url=${encodeURIComponent(demo.src)}&name=${encodeURIComponent(demo.title)}`}
            className="inline-flex items-center gap-3 bg-[#D4AF37] hover:bg-[#E0C15A] text-black font-bold text-base px-8 py-4 rounded-full transition-colors shadow-lg shadow-[#D4AF37]/20 w-full max-w-sm justify-center"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
            </svg>
            Download MP3
          </a>

          {/* Attribution */}
          <p className="text-[11px] text-white/25 text-center">
            Free to download for audition and casting purposes.
            <br />© Dean Miller Narration
          </p>
        </div>

        {/* Other Demos */}
        {otherDemos.length > 0 && (
          <div className="w-full max-w-2xl mt-16">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-px w-6 bg-[#D4AF37]" />
              <p className="text-[11px] uppercase tracking-[0.28em] text-[#D4AF37]">Other Demos</p>
              <div className="flex-1 h-px bg-[#D4AF37]/20" />
            </div>

            <div className="flex flex-nowrap overflow-x-auto gap-4 pb-4 -mx-4 px-4 scrollbar-hide">
              {otherDemos.map(d => (
                <Link key={d.slug} href={`/demos/${d.slug}`}
                  className={`w-64 shrink-0 rounded-xl border-t-2 ${d.color} bg-[#0B1224] p-4 hover:ring-1 hover:ring-white/10 transition-all group flex flex-col`}>
                  <div className="flex-1">
                    <h3 className="font-semibold text-sm text-white mb-1 leading-snug">{d.title}</h3>
                    <p className="text-xs text-white/50 mb-3 leading-snug">{d.desc}</p>
                    {d.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {d.tags.map(tag => (
                          <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-white/8 text-white/50">{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="mt-4 flex items-center gap-2 pt-3 border-t border-white/8">
                    <div className="h-8 w-8 rounded-full bg-[#D4AF37]/15 border border-[#D4AF37]/30 flex items-center justify-center group-hover:bg-[#D4AF37]/25 transition-colors shrink-0">
                      <svg className="h-3.5 w-3.5 translate-x-0.5 text-[#D4AF37]" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5.14v13.72l11-6.86L8 5.14z"/>
                      </svg>
                    </div>
                    <span className="text-xs text-white/40 group-hover:text-white/60 transition-colors">Listen &amp; Download</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Back link */}
      <div className="px-5 pb-8 flex justify-center">
        <Link href="/#demos"
          className="inline-flex items-center gap-2 text-sm text-white/40 hover:text-white transition-colors">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
          </svg>
          Back to all demos
        </Link>
      </div>

      {/* Minimal footer */}
      <footer className="border-t border-white/[0.06] px-5 py-6 text-center">
        <p className="text-[11px] text-white/25">
          © {new Date().getFullYear()} Dean Miller Narration ·{" "}
          <Link href="/" className="hover:text-white/50 transition-colors">dmnarration.com</Link>
        </p>
      </footer>
    </main>
  );
}
