"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

/**
 * The page every admin route sends you to when you are not signed in.
 *
 * It used to be the old Manage Books screen, which had no way to sign in on
 * it: being bounced here meant looking at a books list, going back to the
 * public site, opening a menu, entering the key in a modal, and then
 * navigating a second time to wherever you were originally headed. That screen
 * is gone — it edited a table nothing read.
 *
 * TWO WAYS IN, BOTH LIVE. The admin key is unchanged and still works exactly as
 * it did. Email and password is the new path, and it is the one that will
 * survive: a shared secret cannot express WHO you are, so it cannot express that
 * Marizete is an editor and Dean is not. Signing in with an account is what
 * makes the role real on this surface, the way it already is on the phone —
 * one identity, two surfaces.
 *
 * Neither is a fallback for the other. Both are offered, both are tried
 * separately, and a failure in one says so rather than quietly handing over.
 */

/** Only same-site paths, so a crafted ?next= cannot bounce a signed-in admin off-site. */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/board";
  return raw;
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));

  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountError, setAccountError] = useState("");

  /**
   * Sign in with a real account.
   *
   * Its error state is kept SEPARATE from the key form's. One box saying "that
   * did not work" for two independent mechanisms is precisely how a broken new
   * path hides behind a working old one, which is the thing this migration must
   * not do.
   */
  async function submitAccount() {
    if (!email || !password || accountBusy) return;
    setAccountBusy(true);
    setAccountError("");
    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) {
        setAccountError("That email and password do not match an account.");
        setPassword("");
        return;
      }
      router.replace(next);
      router.refresh();
    } catch {
      setAccountError("Could not sign in. Try again.");
    } finally {
      setAccountBusy(false);
    }
  }

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

        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-white/10" />
          <span className="text-[11px] uppercase tracking-widest text-white/30">or</span>
          <div className="h-px flex-1 bg-white/10" />
        </div>

        <p className="text-xs text-white/40">Sign in with your account</p>
        <input
          type="email"
          autoComplete="username"
          placeholder="Email"
          value={email}
          onChange={e => {
            setEmail(e.target.value);
            setAccountError("");
          }}
          className="mt-2 w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-white/30 transition-colors focus:border-[#D4AF37]/50 focus:outline-none"
        />
        <input
          type="password"
          autoComplete="current-password"
          placeholder="Password"
          value={password}
          onChange={e => {
            setPassword(e.target.value);
            setAccountError("");
          }}
          onKeyDown={e => {
            if (e.key === "Enter") void submitAccount();
          }}
          className="mt-2 w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-white/30 transition-colors focus:border-[#D4AF37]/50 focus:outline-none"
        />
        {accountError && <p className="mt-2 text-xs text-red-400">{accountError}</p>}

        <button
          type="button"
          onClick={() => void submitAccount()}
          disabled={accountBusy || !email || !password}
          className="mt-3 w-full rounded-xl border border-[#D4AF37]/40 py-2 text-sm font-bold text-[#D4AF37] transition-colors hover:bg-[#D4AF37]/10 disabled:opacity-40"
        >
          {accountBusy ? "Signing in…" : "Sign in with account"}
        </button>

        <Link href="/" className="mt-4 block text-center text-xs text-white/40 hover:text-white/70">
          Back to the site
        </Link>
      </div>
    </main>
  );
}
