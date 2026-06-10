"use client";

import { useRef } from "react";

export function TrackedAudio({
  src,
  title,
  genre,
}: {
  src: string;
  title: string;
  genre?: string | null;
}) {
  const fired = useRef(false);

  const handlePlay = () => {
    if (fired.current) return;
    fired.current = true;
    fetch("/api/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "demo_played",
        page: "/demos",
        metadata: { title, genre: genre ?? null },
      }),
    }).catch(() => {});
  };

  return (
    <audio
      controls
      src={src}
      className="w-full h-10"
      style={{ accentColor: "#D4AF37" }}
      onPlay={handlePlay}
    />
  );
}
