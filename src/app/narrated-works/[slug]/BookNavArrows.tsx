"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { navigate } from "./SwipeNav";

export function BookNavArrows({
  prevSlug, prevTitle, prevCover,
  nextSlug, nextTitle, nextCover,
}: {
  prevSlug: string | null; prevTitle: string | null; prevCover: string | null;
  nextSlug: string | null; nextTitle: string | null; nextCover: string | null;
}) {
  const router = useRouter();

  // Place arrows just outside the max-w-5xl (64rem) column in the viewport margin.
  const inset = "max(12px, calc(50vw - 35rem))";

  const arrowClass = "hidden sm:flex fixed top-1/2 -translate-y-1/2 z-40 group flex-col items-center gap-2 cursor-pointer";
  const pillClass  = "p-3 rounded-full bg-[#06082E]/80 backdrop-blur border border-white/10 text-white/30 group-hover:text-[#D4AF37] group-hover:border-[#D4AF37]/40 group-hover:bg-[#D4AF37]/10 transition-all shadow-lg";
  const labelClass = "text-[10px] text-white/20 group-hover:text-[#D4AF37]/60 transition-colors max-w-[72px] text-center leading-tight truncate";

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
          {prevCover && (
            <div className="relative w-9 h-[54px] rounded-lg overflow-hidden border border-white/10 group-hover:border-[#D4AF37]/35 transition-colors shadow-md">
              <Image src={prevCover} alt="" fill className="object-cover" sizes="36px" />
            </div>
          )}
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
          {nextCover && (
            <div className="relative w-9 h-[54px] rounded-lg overflow-hidden border border-white/10 group-hover:border-[#D4AF37]/35 transition-colors shadow-md">
              <Image src={nextCover} alt="" fill className="object-cover" sizes="36px" />
            </div>
          )}
          <span className={labelClass}>{nextTitle}</span>
        </button>
      )}
    </>
  );
}
