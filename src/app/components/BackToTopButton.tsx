"use client";

import { useEffect, useState } from "react";
import { HiArrowUp } from "react-icons/hi";

export default function BackToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > 300);
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

  return (
    <button
      onClick={scrollToTop}
      aria-label="Back to top"
      className={[
        "fixed bottom-6 right-6 z-50",
        "h-12 w-12 flex items-center justify-center",
        "rounded-full border border-white/15",
        "bg-[#0B1020]/80 backdrop-blur-md",
        "text-[#D4AF37]",
        "shadow-[0_10px_30px_rgba(0,0,0,0.35)]",
        "transition-all duration-300",
        "hover:-translate-y-1 hover:border-[#D4AF37]/60 hover:text-white",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]/60",
        visible
          ? "opacity-100 translate-y-0"
          : "opacity-0 translate-y-3 pointer-events-none",
      ].join(" ")}
    >
      <HiArrowUp className="h-5 w-5" />
    </button>
  );
}