"use client";

import { useState } from "react";
import Link from "next/link";

export default function HVOPage() {
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [fileName, setFileName] = useState("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus("submitting");
    setErrorMsg("");

    const form = e.currentTarget;
    const formData = new FormData(form);

    try {
      const res = await fetch("/api/hvo", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(json.error || "Something went wrong.");
        setStatus("error");
      } else {
        setStatus("success");
      }
    } catch {
      setErrorMsg("Network error. Please try again.");
      setStatus("error");
    }
  };

  return (
    <main className="min-h-screen bg-[#06082E] text-white">
      <div className="max-w-2xl mx-auto px-5 sm:px-6 pt-24 pb-16">

        {/* Header */}
        <div className="mb-10">
          <Link href="/" className="text-xs uppercase tracking-[0.2em] text-[#D4AF37] hover:text-[#E0C15A] transition-colors inline-flex items-center gap-1.5 mb-6">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back to site
          </Link>
          <div className="flex items-center gap-4 mb-6">
            <div className="h-px w-6 bg-[#D4AF37]" />
            <p className="text-[11px] uppercase tracking-[0.28em] text-[#D4AF37]">Dean Miller Narration</p>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3">Human Voices Only</h1>
          <p className="text-white/60 leading-relaxed">
            Stories written by humans deserve to be voiced by humans. Submit a snippet from your book and I&apos;ll narrate it as a free marketing sample — for you and your work, no strings attached.
          </p>
        </div>

        {status === "success" ? (
          <div className="rounded-2xl border border-[#D4AF37]/30 bg-gradient-to-br from-[#D4AF37]/10 to-transparent p-8 text-center">
            <div className="text-4xl mb-4">🎙️</div>
            <h2 className="text-xl font-bold text-white mb-2">Submission received!</h2>
            <p className="text-white/65 text-sm leading-relaxed mb-6">
              Thank you for sharing your work. I&apos;ll be in touch soon about your narration sample.
            </p>
            <Link href="/"
              className="inline-flex items-center justify-center rounded-full bg-[#D4AF37] text-black px-6 py-3 text-sm font-bold hover:bg-[#E0C15A] transition-colors">
              Back to homepage
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="rounded-2xl border border-white/8 bg-[#0A0D3A]/60 p-6 sm:p-8 space-y-5">
            {status === "error" && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/8 px-4 py-3 text-sm text-red-300">
                {errorMsg}
              </div>
            )}

            {/* Author Name */}
            <label className="block">
              <span className="text-[11px] uppercase tracking-[0.18em] text-white/40 font-medium">
                Author Name <span className="text-[#D4AF37]">*</span>
              </span>
              <input
                name="author_name"
                type="text"
                required
                disabled={status === "submitting"}
                placeholder="e.g. E.A. Harper"
                className="mt-2 w-full rounded-lg bg-black/30 border border-white/8 px-4 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#D4AF37]/40 transition disabled:opacity-50"
              />
            </label>

            {/* Email */}
            <label className="block">
              <span className="text-[11px] uppercase tracking-[0.18em] text-white/40 font-medium">
                Email <span className="text-[#D4AF37]">*</span>
              </span>
              <input
                name="email"
                type="email"
                required
                disabled={status === "submitting"}
                placeholder="you@example.com"
                className="mt-2 w-full rounded-lg bg-black/30 border border-white/8 px-4 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#D4AF37]/40 transition disabled:opacity-50"
              />
            </label>

            {/* Book Title */}
            <label className="block">
              <span className="text-[11px] uppercase tracking-[0.18em] text-white/40 font-medium">
                Book Title <span className="text-[#D4AF37]">*</span>
              </span>
              <input
                name="book_title"
                type="text"
                required
                disabled={status === "submitting"}
                placeholder="e.g. Whiskey & Lies"
                className="mt-2 w-full rounded-lg bg-black/30 border border-white/8 px-4 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#D4AF37]/40 transition disabled:opacity-50"
              />
            </label>

            {/* Snippet Upload */}
            <div>
              <span className="text-[11px] uppercase tracking-[0.18em] text-white/40 font-medium block mb-1">
                Snippet <span className="text-white/25 normal-case tracking-normal text-[10px]">(optional)</span>
              </span>
              <p className="text-[11px] text-white/30 mb-2">
                300 words or less · .txt, .doc, .docx, or .pdf
              </p>
              <label className={`flex items-center gap-3 w-full rounded-lg border border-white/8 px-4 py-3 cursor-pointer transition hover:border-[#D4AF37]/30 ${status === "submitting" ? "opacity-50 pointer-events-none" : ""}`}>
                <svg className="h-4 w-4 shrink-0 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                <span className="text-sm truncate">
                  {fileName ? (
                    <span className="text-white/70">{fileName}</span>
                  ) : (
                    <span className="text-white/25">Choose file…</span>
                  )}
                </span>
                <input
                  name="snippet"
                  type="file"
                  accept=".txt,.doc,.docx,.pdf"
                  className="sr-only"
                  disabled={status === "submitting"}
                  onChange={e => setFileName(e.target.files?.[0]?.name ?? "")}
                />
              </label>
            </div>

            {/* Comments */}
            <label className="block">
              <span className="text-[11px] uppercase tracking-[0.18em] text-white/40 font-medium block mb-1">
                Comments <span className="text-white/25 normal-case tracking-normal text-[10px]">(optional)</span>
              </span>
              <textarea
                name="comments"
                rows={3}
                disabled={status === "submitting"}
                placeholder="Anything you'd like me to know — genre, tone, character notes…"
                className="mt-1 w-full rounded-lg bg-black/30 border border-white/8 px-4 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#D4AF37]/40 transition disabled:opacity-50 resize-none leading-relaxed"
              />
            </label>

            <p className="text-xs text-white/30 leading-relaxed">
              By submitting, you confirm you hold the rights to the excerpt provided. Your contact information will only be used to follow up about your narration sample.
            </p>

            <button
              type="submit"
              disabled={status === "submitting"}
              className="w-full rounded-full bg-[#D4AF37] text-black px-6 py-3.5 text-sm font-bold tracking-wide transition hover:bg-[#E0C15A] active:scale-[0.99] disabled:opacity-50"
            >
              {status === "submitting" ? "Sending…" : "Submit snippet"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
