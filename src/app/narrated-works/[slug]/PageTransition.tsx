"use client";

import { useEffect, useLayoutEffect, useState } from "react";

// useLayoutEffect runs before paint on the client but throws on the server —
// fall back to useEffect for SSR so there's no warning.
const useClientLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function PageTransition({ children }: { children: React.ReactNode }) {
  const [style, setStyle] = useState<React.CSSProperties>({
    opacity: 0,
    transform: "translateX(40px)", // default; corrected before first paint
    transition: "none",
  });

  useClientLayoutEffect(() => {
    // Runs synchronously before the browser paints, so the correct starting
    // offset is applied before the user sees anything.
    const dir = sessionStorage.getItem("navDir");
    sessionStorage.removeItem("navDir");
    const fromX = dir === "prev" ? "-40px" : "40px";

    // Set the real starting position (no transition yet — instant jump)
    setStyle({ opacity: 0, transform: `translateX(${fromX})`, transition: "none" });

    // On the next frame, transition to the resting position
    const id = requestAnimationFrame(() => {
      setStyle({
        opacity: 1,
        transform: "translateX(0)",
        transition: "transform 320ms ease, opacity 320ms ease",
      });
    });

    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div data-page-content style={style}>
      {children}
    </div>
  );
}
