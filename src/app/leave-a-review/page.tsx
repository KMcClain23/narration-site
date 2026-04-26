"use client";

import { useState, useTransition, useEffect } from "react";
import Link from "next/link";

export default function LeaveAReviewPage() {
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [bookTitle, setBookTitle] = useState("");
  const [books, setBooks] = useState<string[]>([]);
  const [useCustomTitle, setUseCustomTitle] = useState(false);

  // Fetch book titles on load
  useEffect(() => {
    fetch("/api/books")
      .then(r => r.json())
      .then(data => {
        const titles = (data.books || []).map((b: { title: string }) => b.title).sort();
        setBooks(titles);
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = {
      reviewer_name: (form.elements.namedItem("reviewer_name") as HTMLInputElement).value,
      reviewer_role: (form.elements.namedItem("reviewer_role") as HTMLSelectElement).value,
      book_title: bookTitle,
      quote: (form.elements.namedItem("quote") as HTMLTextAreaElement).value,
    };

    startTransition(async () => {
      try {
        const res = await fetch("/api/testimonials", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
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
    });
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
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3">Leave a review</h1>
          <p className="text-white/60 leading-relaxed">
            Worked with Dean on an audiobook project? Share your experience. Submitted reviews are reviewed before being published on the site.
          </p>
        </div>

        {status === "success" ? (
          <div className="rounded-2xl border border-[#D4AF37]/30 bg-gradient-to-br from-[#D4AF37]/10 to-transparent p-8 text-center">
            <div className="text-4xl mb-4">🙏</div>
            <h2 className="text-xl font-bold text-white mb-2">Thank you!</h2>
            <p className="text-white/65 text-sm leading-relaxed mb-6">
              Your review has been submitted and will appear on the site once approved. It genuinely means a lot.
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

            {/* Name */}
            <label className="block">
              <span className="text-[11px] uppercase tracking-[0.18em] text-white/40 font-medium">Your name <span className="text-[#D4AF37]">*</span></span>
              <input
                name="reviewer_name"
                required
                disabled={isPending}
                placeholder="e.g. E.A. Harper"
                className="mt-2 w-full rounded-lg bg-black/30 border border-white/8 px-4 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#D4AF37]/40 transition disabled:opacity-50"
              />
            </label>

            {/* Role */}
            <label className="block">
              <span className="text-[11px] uppercase tracking-[0.18em] text-white/40 font-medium">I am a <span className="text-[#D4AF37]">*</span></span>
              <select
                name="reviewer_role"
                required
                disabled={isPending}
                defaultValue=""
                className="mt-2 w-full rounded-lg bg-black/30 border border-white/8 px-4 py-3 text-sm text-white focus:outline-none focus:border-[#D4AF37]/40 transition disabled:opacity-50 appearance-none"
              >
                <option value="" disabled>Select your role</option>
                <option value="author">Author — I hired Dean to narrate my book</option>
                <option value="narrator">Narrator — I worked alongside Dean</option>
              </select>
            </label>

            {/* Book title — dropdown + custom option */}
            <div>
              <span className="text-[11px] uppercase tracking-[0.18em] text-white/40 font-medium block mb-2">
                Book title <span className="text-white/25 normal-case tracking-normal text-[10px]">(optional)</span>
              </span>

              {!useCustomTitle ? (
                <div className="space-y-2">
                  <select
                    value={bookTitle}
                    onChange={e => setBookTitle(e.target.value)}
                    disabled={isPending}
                    className="w-full rounded-lg bg-black/30 border border-white/8 px-4 py-3 text-sm text-white focus:outline-none focus:border-[#D4AF37]/40 transition disabled:opacity-50 appearance-none"
                  >
                    <option value="">— Select a book —</option>
                    {books.map(title => (
                      <option key={title} value={title}>{title}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setUseCustomTitle(true)}
                    className="text-xs text-white/30 hover:text-[#D4AF37] transition-colors"
                  >
                    My book isn&apos;t listed — type it instead
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <input
                    value={bookTitle}
                    onChange={e => setBookTitle(e.target.value)}
                    disabled={isPending}
                    placeholder="e.g. Whiskey & Lies"
                    className="w-full rounded-lg bg-black/30 border border-white/8 px-4 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#D4AF37]/40 transition disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={() => { setUseCustomTitle(false); setBookTitle(""); }}
                    className="text-xs text-white/30 hover:text-[#D4AF37] transition-colors"
                  >
                    ← Choose from the list instead
                  </button>
                </div>
              )}
            </div>

            {/* Review */}
            <label className="block">
              <span className="text-[11px] uppercase tracking-[0.18em] text-white/40 font-medium">Your review <span className="text-[#D4AF37]">*</span></span>
              <textarea
                name="quote"
                required
                rows={6}
                disabled={isPending}
                placeholder="Share your experience working with Dean..."
                className="mt-2 w-full rounded-lg bg-black/30 border border-white/8 px-4 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#D4AF37]/40 transition disabled:opacity-50 resize-none"
              />
            </label>

            <p className="text-xs text-white/30 leading-relaxed">
              By submitting, you agree that your review may be published on dmnarration.com. Reviews are moderated and may be lightly edited for formatting only.
            </p>

            <button
              type="submit"
              disabled={isPending}
              className="w-full rounded-full bg-[#D4AF37] text-black px-6 py-3.5 text-sm font-bold tracking-wide transition hover:bg-[#E0C15A] active:scale-[0.99] disabled:opacity-50"
            >
              {isPending ? "Submitting…" : "Submit review"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
