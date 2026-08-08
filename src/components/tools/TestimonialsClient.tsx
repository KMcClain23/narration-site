"use client";
import { formatDate } from "@/lib/timezone";

import { useCallback, useEffect, useState } from "react";
import { adminType } from "@/lib/design-tokens";

type Testimonial = {
  id: string;
  reviewer_name: string;
  reviewer_role: "author" | "narrator";
  book_title: string;
  quote: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
};

const STATUS_PILL: Record<Testimonial["status"], string> = {
  pending: "bg-accent-amber/15 text-accent-amber-bright border-accent-amber/30",
  approved: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  rejected: "bg-alert-red/15 text-alert-red border-alert-red/30",
};

const FILTERS = ["pending", "approved", "rejected", "all"] as const;
type Filter = (typeof FILTERS)[number];

export function TestimonialsClient() {
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("pending");
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

  const updateStatus = async (id: string, status: Testimonial["status"]) => {
    setActing(id);
    try {
      const res = await fetch("/api/testimonials", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      if (!res.ok) throw new Error();
      setTestimonials(prev => prev.map(t => (t.id === id ? { ...t, status } : t)));
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
  const countFor = (f: Filter) => (f === "all" ? testimonials.length : testimonials.filter(t => t.status === f).length);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className={adminType.titleLg}>
          Testimonials <span className="text-text-muted">({testimonials.length})</span>
        </h1>
        <a
          href="/leave-a-review"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-semibold text-accent-amber-bright border border-accent-amber/30 px-4 py-2 rounded-lg hover:bg-accent-amber/10 transition-colors"
        >
          View submission form ↗
        </a>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map(f => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wide transition-colors ${
              filter === f
                ? "border-accent-amber-dim bg-accent-amber-dim/15 text-accent-amber-bright"
                : "border-surface-border text-text-muted hover:text-text-body"
            }`}
          >
            {f} ({countFor(f)})
          </button>
        ))}
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-alert-red/30 bg-alert-red/10 px-4 py-3 text-sm text-alert-red">
          {error} <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      {loading ? (
        <div className="mt-10 py-16 text-center">
          <div className="inline-block h-5 w-5 border-2 border-accent-amber border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-6 py-16 text-center rounded-2xl border border-dashed border-surface-border">
          <p className="text-sm italic text-text-faint">
            {filter === "pending" ? "No pending reviews — you're all caught up." : `No ${filter} reviews.`}
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {filtered.map(t => (
            <div
              key={t.id}
              className={`rounded-lg border bg-surface p-5 transition-colors ${
                t.status === "rejected" ? "border-surface-border opacity-60" : "border-surface-border"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-text-primary">{t.reviewer_name}</p>
                    <span className="rounded-full border border-surface-border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-text-muted">
                      {t.reviewer_role}
                    </span>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${STATUS_PILL[t.status]}`}>
                      {t.status}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-3 text-[12px] text-text-faint">
                    {t.book_title && <span>{t.book_title}</span>}
                    <span>{formatDate(t.created_at)}</span>
                  </div>
                </div>
              </div>

              <blockquote className="mt-3 border-l-2 border-accent-amber/30 pl-4 text-sm italic leading-relaxed text-text-body">
                &ldquo;{t.quote}&rdquo;
              </blockquote>

              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-surface-border pt-3">
                {t.status !== "approved" && (
                  <button
                    type="button"
                    disabled={acting === t.id}
                    onClick={() => updateStatus(t.id, "approved")}
                    className="rounded-full bg-emerald-500 px-4 py-1.5 text-xs font-bold text-black transition hover:brightness-110 disabled:opacity-50"
                  >
                    Approve
                  </button>
                )}
                {t.status !== "rejected" && (
                  <button
                    type="button"
                    disabled={acting === t.id}
                    onClick={() => updateStatus(t.id, "rejected")}
                    className="rounded-full border border-alert-red/30 bg-alert-red/10 px-4 py-1.5 text-xs font-bold text-alert-red transition hover:bg-alert-red/20 disabled:opacity-50"
                  >
                    Reject
                  </button>
                )}
                {t.status === "rejected" && (
                  <button
                    type="button"
                    disabled={acting === t.id}
                    onClick={() => updateStatus(t.id, "pending")}
                    className="rounded-full border border-surface-border px-4 py-1.5 text-xs font-semibold text-text-muted transition hover:text-text-primary disabled:opacity-50"
                  >
                    Restore to pending
                  </button>
                )}
                <button
                  type="button"
                  disabled={acting === t.id}
                  onClick={() => deleteTestimonial(t.id)}
                  className="ml-auto text-xs font-semibold text-text-faint transition-colors hover:text-alert-red disabled:opacity-40"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
