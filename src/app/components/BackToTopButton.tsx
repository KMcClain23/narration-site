"use client";

import { useEffect, useState } from "react";
import { HiArrowUp } from "react-icons/hi";

export default function BackToTopButton() {
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight =
        document.documentElement.scrollHeight - window.innerHeight;

      const scrolled = docHeight > 0 ? scrollTop / docHeight : 0;

      setProgress(scrolled);
      setVisible(scrollTop > 300);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - progress * circumference;

  return (
    <button
      type="button"
      onClick={scrollToTop}
      aria-label="Back to top"
className={[
  "fixed bottom-24 right-8 sm:right-10 lg:right-20 xl:right-[calc((100vw-80rem)/2+4rem)] z-50",
  "h-14 w-14 rounded-full",
  "flex items-center justify-center",
  "border border-white/10",
  "bg-[#0B1020]/85 backdrop-blur-md",
  "shadow-[0_10px_30px_rgba(0,0,0,0.4)]",
  "transition-all duration-300",
  "hover:-translate-y-1 hover:border-[#D4AF37]/50 hover:shadow-[0_14px_35px_rgba(0,0,0,0.45)]",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]/60",
  "focus-visible:ring-offset-2 focus-visible:ring-offset-[#050814]",
  visible
    ? "translate-y-0 opacity-100"
    : "pointer-events-none translate-y-4 opacity-0",
].join(" ")}
    >
      <svg
        className="absolute inset-0 -rotate-90"
        width="56"
        height="56"
        viewBox="0 0 56 56"
        aria-hidden="true"
      >
        <circle
          cx="28"
          cy="28"
          r={radius}
          stroke="rgba(255,255,255,0.12)"
          strokeWidth="3"
          fill="transparent"
        />
        <circle
          cx="28"
          cy="28"
          r={radius}
          stroke="#D4AF37"
          strokeWidth="3"
          fill="transparent"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className="transition-all duration-200"
        />
      </svg>

      <HiArrowUp className="relative z-10 h-5 w-5 text-[#D4AF37]" />
    </button>
  );
}