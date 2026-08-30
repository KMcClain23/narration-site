"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

/**
 * The sign-in form: email and password, and nothing else.
 *
 * THE ADMIN KEY IS GONE FROM HERE. A shared secret cannot express WHO you are,
 * so it could never express that Marizete is an editor and Dean is not — which
 * is the entire reason the roles exist. Every browser now signs in as an
 * account, and the role comes from public.profiles.
 *
 * ADMIN_SECRET_KEY still exists in the environment. It is no longer a login: it
 * is only the internal bearer /process uses to call /extract. See
 * require-admin.ts, which explains what removing it breaks and how quietly.
 *
 * This renders only when nobody is signed in. A session with the wrong role gets
 * the no-access page instead — see page.tsx — because showing this form to
 * someone whose password was correct tells them it was not.
 */

/** Only same-site paths, so a crafted ?next= cannot bounce a signed-in admin off-site. */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/board";
  return raw;
}

function Form() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!email || !password || busy) return;
    setBusy(true);
    setError("");
    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) {
        setError("That email and password do not match an account.");
        setPassword("");
        return;
      }
      // replace, not push: the back button should not land on a login page you
      // are already past. refresh() so the server component re-reads the session
      // and decides which of the three states to show.
      router.replace(next);
      router.refresh();
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
          type="email"
          autoFocus
          autoComplete="username"
          placeholder="Email"
          value={email}
          onChange={e => {
            setEmail(e.target.value);
            setError("");
          }}
          className="mt-4 w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-white/30 transition-colors focus:border-[#D4AF37]/50 focus:outline-none"
        />
        <input
          type="password"
          autoComplete="current-password"
          placeholder="Password"
          value={password}
          onChange={e => {
            setPassword(e.target.value);
            setError("");
          }}
          onKeyDown={e => {
            if (e.key === "Enter") void submit();
          }}
          className="mt-2 w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-white/30 transition-colors focus:border-[#D4AF37]/50 focus:outline-none"
        />
        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || !email || !password}
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

export function LoginForm() {
  // useSearchParams needs a Suspense boundary to keep the route static-safe.
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#06082E]" />}>
      <Form />
    </Suspense>
  );
}
