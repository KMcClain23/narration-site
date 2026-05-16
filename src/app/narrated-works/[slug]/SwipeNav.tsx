"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function SwipeNav({
  prevSlug,
  nextSlug,
}: {
  prevSlug: string | null;
  nextSlug: string | null;
}) {
  const router = useRouter();

  useEffect(() => {
    let startX = 0;
    let startY = 0;

    const onTouchStart = (e: TouchEvent) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    };

    const onTouchEnd = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;
      // Require a clear horizontal swipe (>60px and more horizontal than vertical)
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      if (dx < 0 && nextSlug) router.push(`/narrated-works/${nextSlug}`);
      else if (dx > 0 && prevSlug) router.push(`/narrated-works/${prevSlug}`);
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchend",   onTouchEnd,   { passive: true });
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchend",   onTouchEnd);
    };
  }, [prevSlug, nextSlug, router]);

  return null;
}
