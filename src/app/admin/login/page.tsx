"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * The page every admin route sends you to when you are not signed in.
 *
 * It used to be the old Manage Books screen, which had no way to sign in on
 * it: being bounced here meant looking at a books list, going back to the
 * public site, opening a menu, entering the key in a modal, and then
 * navigating a second time to wherever you were originally headed. The books
 * screen now lives at /admin/books, behind the gate like everything else.
 */

/** Only same-site paths, so a crafted ?next= cannot bounce a signed-in admin off-site. */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/board";
  return raw;
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));

  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!key || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const data = await res.json().catch(() => null);
      if (data?.success) {
        // replace, not push: the back button should not land on a login page
        // you are already past.
        router.replace(next);
        router.refresh();
      } else {
        setError("That key was not accepted.");
        setKey("");
      }
    } catch {
      setError("Could not sign in. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#06082E] px-6">
      <div className="w-full max-w-sm rounded-2xl border border-[#1A2070] bg-[#0A0D3A] p-6 shadow-2xl">
        <h1 className="text-base font-bold text-white">Admin Access</h1>
        <p className="mt-1 text-sm text-white/50">
          {next === "/board" ? "Sign in to continue." : `Sign in to continue to ${next}.`}
        </p>

        <input
          type="password"
          autoFocus
          placeholder="Enter admin key"
          value={key}
          onChange={e => {
            setKey(e.target.value);
            setError("");
          }}
          onKeyDown={e => {
            if (e.key === "Enter") void submit();
          }}
          className="mt-4 w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-white/30 transition-colors focus:border-[#D4AF37]/50 focus:outline-none"
        />
        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || !key}
          className="mt-4 w-full rounded-xl bg-[#D4AF37] py-2 text-sm font-bold text-black transition-colors hover:bg-[#E0C15A] disabled:opacity-40"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>

        <Link href="/" className="mt-4 block text-center text-xs text-white/40 hover:text-white/70">
          Back to the site
        </Link>
      </div>
    </main>
  );
}

export default function AdminLoginPage() {
  // useSearchParams needs a Suspense boundary to keep the route static-safe.
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#06082E]" />}>
      <LoginForm />
    </Suspense>
  );
}
