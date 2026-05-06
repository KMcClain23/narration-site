"use client";
import { useEffect } from "react";

export function TrackPageView({ slug, title, author }: { slug: string; title: string; author: string }) {
  useEffect(() => {
    fetch("/api/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "book_page_viewed",
        page: `/narrated-works/${slug}`,
        metadata: { title, author, slug },
      }),
    }).catch(() => {});
  }, [slug, title, author]);
  return null;
}
