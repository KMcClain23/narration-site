"use client";

import { useState, useEffect, useCallback } from "react";

interface Testimonial {
  id: string;
  reviewer_name: string;
  reviewer_role: "author" | "narrator";
  book_title: string;
  quote: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
}

const STATUS_STYLES = {
  pending:  "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
  approved: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  rejected: "bg-red-500/15 text-red-300 border-red-500/30",
};

export default function TestimonialQueue() {
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/testimonials?admin=true");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTestimonials(data.testimonials || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (id: string, status: "approved" | "rejected" | "pending") => {
    setActing(id);
    try {
      const res = await fetch("/api/testimonials", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      if (!res.ok) throw new Error();
      setTestimonials(prev => prev.map(t => t.id === id ? { ...t, status } : t));
    } catch {
      setError("Failed to update.");
    } finally {
      setActing(null);
    }
  };

  const deleteTestimonial = async (id: string) => {
    if (!confirm("Permanently delete this review?")) return;
    setActing(id);
    try {
      const res = await fetch("/api/testimonials", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error();
      setTestimonials(prev => prev.filter(t => t.id !== id));
    } catch {
      setError("Failed to delete.");
    } finally {
      setActing(null);
    }
  };

  const filtered = testimonials.filter(t => filter === "all" || t.status === filter);
  const pendingCount = testimonials.filter(t => t.status === "pending").length;

  return (
    <section className="mt-12 pt-12 border-t border-[#1A2070]">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-white flex items-center gap-3">
            Review submissions
            {pendingCount > 0 && (
              <span className="inline-flex items-center justify-center h-6 min-w-6 rounded-full bg-[#D4AF37] text-black text-xs font-bold px-2">
                {pendingCount}
              </span>
            )}
          </h2>
          <p className="mt-1 text-sm text-white/40">Approve or reject reviews submitted through the site.</p>
        </div>
        <a href="/leave-a-review" target="_blank" rel="noopener"
          className="text-xs font-semibold text-[#D4AF37] border border-[#D4AF37]/30 px-4 py-2 rounded-lg hover:bg-[#D4AF37]/10 transition-colors">
          View submission form ↗
        </a>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-300">
          {error} <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {(["pending", "approved", "rejected", "all"] as const).map(f => (
          <button key={f} type="button" onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide border transition-colors ${
              filter === f ? "bg-[#D4AF37] text-black border-[#D4AF37]" : "border-white/15 text-white/50 hover:text-white"
            }`}>
            {f} {f !== "all" && `(${testimonials.filter(t => t.status === f).length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-16 text-center">
          <div className="inline-block h-5 w-5 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center rounded-2xl border border-dashed border-[#1A2070]">
          <p className="text-white/20 italic text-sm">
            {filter === "pending" ? "No pending reviews — you're all caught up." : `No ${filter} reviews.`}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(t => (
            <div key={t.id} className={`rounded-2xl border bg-[#0A0D3A] p-5 transition-all ${
              t.status === "pending" ? "border-yellow-500/20" :
              t.status === "approved" ? "border-emerald-500/15" :
              "border-red-500/15 opacity-60"
            }`}>
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <p className="font-semibold text-white">{t.reviewer_name}</p>
                    <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                      t.reviewer_role === "author" ? "bg-purple-500/15 text-purple-300 border-purple-500/30" : "bg-blue-500/15 text-blue-300 border-blue-500/30"
                    }`}>{t.reviewer_role}</span>
                    <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${STATUS_STYLES[t.status]}`}>
                      {t.status}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-white/35">
                    {t.book_title && <span>📖 {t.book_title}</span>}
                    <span>{new Date(t.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                  </div>
                </div>
              </div>

              <blockquote className="text-sm text-white/70 leading-relaxed border-l-2 border-[#D4AF37]/30 pl-4 mb-4 italic">
                &ldquo;{t.quote}&rdquo;
              </blockquote>

              <div className="flex flex-wrap gap-2 pt-3 border-t border-white/6">
                {t.status !== "approved" && (
                  <button type="button" disabled={acting === t.id}
                    onClick={() => updateStatus(t.id, "approved")}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-black bg-emerald-500 hover:bg-emerald-400 px-4 py-2 rounded-full transition-colors disabled:opacity-50">
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    Approve
                  </button>
                )}
                {t.status !== "rejected" && (
                  <button type="button" disabled={acting === t.id}
                    onClick={() => updateStatus(t.id, "rejected")}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 px-4 py-2 rounded-full transition-colors disabled:opacity-50">
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    Reject
                  </button>
                )}
                {t.status === "rejected" && (
                  <button type="button" disabled={acting === t.id}
                    onClick={() => updateStatus(t.id, "pending")}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/50 hover:text-white border border-white/15 px-4 py-2 rounded-full transition-colors disabled:opacity-50">
                    Restore to pending
                  </button>
                )}
                <button type="button" disabled={acting === t.id}
                  onClick={() => deleteTestimonial(t.id)}
                  className="ml-auto text-xs font-semibold text-red-400/40 hover:text-red-400 transition-colors disabled:opacity-40">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
