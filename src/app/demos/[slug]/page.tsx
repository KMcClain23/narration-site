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
  const currentIdx = DEMOS.findIndex(d => d.slug === slug);
  if (currentIdx === -1) notFound();

  const demo     = DEMOS[currentIdx];
  const prevDemo = currentIdx > 0                  ? DEMOS[currentIdx - 1] : null;
  const nextDemo = currentIdx < DEMOS.length - 1   ? DEMOS[currentIdx + 1] : null;

  const arrowBtn   = "p-3 rounded-full bg-[#06082E]/80 backdrop-blur border border-white/10 text-white/30 group-hover:text-[#D4AF37] group-hover:border-[#D4AF37]/40 group-hover:bg-[#D4AF37]/10 transition-all shadow-lg";
  const arrowLabel = "text-[10px] text-white/20 group-hover:text-[#D4AF37]/60 transition-colors max-w-[80px] text-center leading-tight truncate";
  const arrowInset = "max(12px, calc(50vw - 19rem))";

  return (
    <main className="min-h-screen bg-[#06082E] text-white flex flex-col">

      {/* Prev / next nav arrows */}
      {prevDemo && (
        <Link href={`/demos/${prevDemo.slug}`} title={prevDemo.title}
          className="hidden sm:flex fixed top-1/2 -translate-y-1/2 z-40 group flex-col items-center gap-1.5"
          style={{ left: arrowInset }}>
          <div className={arrowBtn}>
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
            </svg>
          </div>
          <span className={arrowLabel}>{prevDemo.title}</span>
        </Link>
      )}
      {nextDemo && (
        <Link href={`/demos/${nextDemo.slug}`} title={nextDemo.title}
          className="hidden sm:flex fixed top-1/2 -translate-y-1/2 z-40 group flex-col items-center gap-1.5"
          style={{ right: arrowInset }}>
          <div className={arrowBtn}>
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
            </svg>
          </div>
          <span className={arrowLabel}>{nextDemo.title}</span>
        </Link>
      )}

      {/* Hero content */}
      <div className="flex-1 flex flex-col items-center justify-center px-5 py-16 sm:py-24">
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

          {/* Mobile prev/next (arrows hidden on mobile) */}
          {(prevDemo || nextDemo) && (
            <div className="sm:hidden flex items-center justify-between w-full pt-2">
              {prevDemo
                ? <Link href={`/demos/${prevDemo.slug}`}
                    className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white transition-colors">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
                    </svg>
                    {prevDemo.title}
                  </Link>
                : <span />
              }
              {nextDemo
                ? <Link href={`/demos/${nextDemo.slug}`}
                    className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white transition-colors">
                    {nextDemo.title}
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                    </svg>
                  </Link>
                : <span />
              }
            </div>
          )}
        </div>
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
