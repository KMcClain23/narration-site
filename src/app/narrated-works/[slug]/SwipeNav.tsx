"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Set the direction flag so CSS view-transition knows which way to slide
function setDir(dir: "next" | "prev") {
  document.documentElement.dataset.navDir = dir === "prev" ? "prev" : "";
}

export function navigate(router: ReturnType<typeof useRouter>, slug: string, dir: "next" | "prev") {
  const url = `/narrated-works/${slug}`;
  setDir(dir);

  if ("startViewTransition" in document) {
    (document as Document & { startViewTransition: (cb: () => void) => void })
      .startViewTransition(() => { router.push(url); });
  } else {
    router.push(url);
  }
}

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
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      if (dx < 0 && nextSlug) navigate(router, nextSlug, "next");
      else if (dx > 0 && prevSlug) navigate(router, prevSlug, "prev");
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
