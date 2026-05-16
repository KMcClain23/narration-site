"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const EXIT_MS = 240;

export function navigate(
  router: ReturnType<typeof useRouter>,
  slug: string,
  dir: "next" | "prev",
) {
  sessionStorage.setItem("navDir", dir);

  // Animate the current page out before navigating
  const el = document.querySelector<HTMLElement>("[data-page-content]");
  if (el) {
    const tx = dir === "next" ? "-40px" : "40px";
    el.style.transition = `transform ${EXIT_MS}ms ease, opacity ${EXIT_MS}ms ease`;
    el.style.transform = `translateX(${tx})`;
    el.style.opacity = "0";
  }

  setTimeout(() => router.push(`/narrated-works/${slug}`), EXIT_MS);
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
