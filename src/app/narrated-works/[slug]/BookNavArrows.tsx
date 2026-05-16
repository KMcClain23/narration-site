"use client";

import { useRouter } from "next/navigation";
import { navigate } from "./SwipeNav";

export function BookNavArrows({
  prevSlug, prevTitle,
  nextSlug, nextTitle,
}: {
  prevSlug: string | null; prevTitle: string | null;
  nextSlug: string | null; nextTitle: string | null;
}) {
  const router = useRouter();

  // Pin arrows to the inner padding edge of the max-w-5xl (64rem) content column.
  // calc(50vw - 30rem) = half viewport − (half content − px-8 padding).
  // max(1rem, …) keeps them on-screen when the viewport is narrower than the column.
  const inset = "max(1rem, calc(50vw - 30rem))";

  const arrowClass = "hidden sm:flex fixed top-1/2 -translate-y-1/2 z-40 group flex-col items-center gap-1.5 cursor-pointer";
  const pillClass  = "p-3 rounded-full bg-[#06082E]/80 backdrop-blur border border-white/10 text-white/30 group-hover:text-[#D4AF37] group-hover:border-[#D4AF37]/40 group-hover:bg-[#D4AF37]/10 transition-all shadow-lg";
  const labelClass = "text-[10px] text-white/20 group-hover:text-[#D4AF37]/60 transition-colors max-w-[80px] text-center leading-tight truncate";

  return (
    <>
      {prevSlug && (
        <button onClick={() => navigate(router, prevSlug, "prev")} title={prevTitle ?? "Previous"}
          className={arrowClass} style={{ left: inset }}>
          <div className={pillClass}>
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
            </svg>
          </div>
          <span className={labelClass}>{prevTitle}</span>
        </button>
      )}
      {nextSlug && (
        <button onClick={() => navigate(router, nextSlug, "next")} title={nextTitle ?? "Next"}
          className={arrowClass} style={{ right: inset }}>
          <div className={pillClass}>
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
            </svg>
          </div>
          <span className={labelClass}>{nextTitle}</span>
        </button>
      )}
    </>
  );
}
