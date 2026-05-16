"use client";

import { useEffect, useRef, useState } from "react";

export function PageTransition({ children }: { children: React.ReactNode }) {
  const [entered, setEntered] = useState(false);
  const dirRef = useRef<string | null>(null);

  useEffect(() => {
    dirRef.current = sessionStorage.getItem("navDir");
    sessionStorage.removeItem("navDir");
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const fromX = dirRef.current === "prev" ? "-40px" : "40px";

  return (
    <div
      data-page-content
      style={{
        transform: entered ? "translateX(0)" : `translateX(${fromX})`,
        opacity: entered ? 1 : 0,
        transition: entered ? "transform 320ms ease, opacity 320ms ease" : "none",
      }}
    >
      {children}
    </div>
  );
}
