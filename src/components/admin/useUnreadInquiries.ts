"use client";

import { useEffect, useState } from "react";

// Same source the inquiries admin view reads — same Redis-backed list, no
// separate/hardcoded count logic. Shared between Sidebar (desktop) and
// BottomTabBar (mobile) so both don't independently fetch the same data.
export function useUnreadInquiries(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    fetch("/api/inquiries")
      .then(r => (r.ok ? r.json() : []))
      .then(data => setCount(Array.isArray(data) ? data.length : 0))
      .catch(() => {});
  }, []);

  return count;
}
