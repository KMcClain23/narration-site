"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

/**
 * Claim and release, with HER JWT — the same pattern as every other editor
 * write: `.rpc()` straight from the browser, so `assert_editor_access` is
 * evaluated against a caller who exists.
 *
 * A REFUSAL IS SHOWN, NOT SWALLOWED. `claim_card_for_editing` raises when
 * somebody else holds the book and names them; that message is the only way she
 * would ever find out, so it goes on screen rather than into a console. Claiming
 * a book that is already hers succeeds silently by design — pressing the button
 * twice, or on a second device, is not an error.
 */
export function ClaimButton({
  cardId,
  mine,
  className = "",
}: {
  cardId: string;
  mine: boolean;
  className?: string;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [, startTransition] = useTransition();

  async function go(e: React.MouseEvent) {
    // The tile behind this is a Link — without both of these, claiming
    // navigates away from the list she is working through.
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const { error: err } = mine
        ? await supabase.rpc("release_card_editing", { p_card_id: cardId })
        : await supabase.rpc("claim_card_for_editing", { p_card_id: cardId });
      if (err) {
        setError(err.message);
        return;
      }
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className={`inline-flex flex-col items-start gap-1 ${className}`}>
      <button
        type="button"
        onClick={go}
        disabled={busy}
        className={
          mine
            ? "rounded-full border border-white/20 px-3 py-1 text-[11px] text-white/60 transition-colors hover:border-white/40 hover:text-white/85 disabled:opacity-50"
            : "rounded-full bg-[#D4AF37] px-3 py-1 text-[11px] font-bold text-black transition-opacity hover:opacity-85 disabled:opacity-50"
        }
      >
        {busy ? "…" : mine ? "Release" : "Claim"}
      </button>
      {error && <span className="text-[11px] text-rose-300">{error}</span>}
    </span>
  );
}
