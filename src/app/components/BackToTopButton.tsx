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
      onClick={scrollToTop}
      aria-label="Back to top"
      className={[
        // POSITIONING (closer to content instead of edge)
        "fixed bottom-8 right-[max(2rem,calc((100vw-64rem)/2+1rem))] z-50",

        // SIZE & SHAPE
        "h-14 w-14 rounded-full",

        // STYLE
        "bg-[#0B1020]/85 backdrop-blur-md",
        "border border-white/10",
        "shadow-[0_10px_30px_rgba(0,0,0,0.4)]",

        // INTERACTION
        "flex items-center justify-center",
        "transition-all duration-300",
        "hover:-translate-y-1 hover:border-[#D4AF37]/50",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]/60",

        // VISIBILITY
        visible
          ? "opacity-100 translate-y-0"
          : "opacity-0 translate-y-4 pointer-events-none",
      ].join(" ")}
    >
      {/* Progress Ring */}
      <svg
        className="absolute inset-0 rotate-[-90deg]"
        width="56"
        height="56"
      >
        <circle
          cx="28"
          cy="28"
          r={radius}
          stroke="rgba(255,255,255,0.1)"
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

      {/* Icon */}
      <HiArrowUp className="h-5 w-5 text-[#D4AF37] transition group-hover:text-white" />
    </button>
  );
}