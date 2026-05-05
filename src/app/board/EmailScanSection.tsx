"use client";

import { useState, useEffect } from "react";

type Suggestion = {
  emailIndex:          number;
  bookTitle:           string;
  cardId:              string;
  emailSubject:        string;
  senderName:          string;
  emailDate:           string;
  suggestedDeadline:   string | null;
  suggestedFirst15Date: string | null;
  notes:               string;
};

export function EmailScanSection() {
  const [connected, setConnected]         = useState<boolean | null>(null);
  const [scanning, setScanning]           = useState(false);
  const [suggestions, setSuggestions]     = useState<Suggestion[]>([]);
  const [dismissed, setDismissed]         = useState<Set<number>>(new Set());
  const [updating, setUpdating]           = useState<Set<number>>(new Set());
  const [scanStats, setScanStats]         = useState("");
  const [error, setError]                 = useState("");
  const [successToast, setSuccessToast]   = useState(false);

  useEffect(() => {
    // Check connection status from the API
    fetch("/api/email-scan")
      .then(r => r.json())
      .then(d => setConnected(!!d.connected))
      .catch(() => setConnected(false));

    // Handle OAuth redirect params
    const params = new URLSearchParams(window.location.search);
    const ms = params.get("microsoft");

    if (ms === "connected") {
      setConnected(true);
      setSuccessToast(true);
      // Clean URL so the param doesn't persist on refresh
      const clean = new URL(window.location.href);
      clean.searchParams.delete("microsoft");
      window.history.replaceState({}, "", clean.toString());
      // Auto-dismiss after 4 s
      const t = setTimeout(() => setSuccessToast(false), 4000);
      return () => clearTimeout(t);
    }

    if (ms === "error") {
      const detail = params.get("ms_error") ?? "unknown error";
      setError(`Microsoft connection failed: ${detail}`);
      const clean = new URL(window.location.href);
      clean.searchParams.delete("microsoft");
      clean.searchParams.delete("ms_error");
      window.history.replaceState({}, "", clean.toString());
    }
  }, []);

  async function handleScan() {
    setScanning(true);
    setError("");
    setScanStats("");
    setSuggestions([]);
    setDismissed(new Set());

    try {
      const res  = await fetch("/api/email-scan", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Scan failed");
        return;
      }

      setSuggestions(data.suggestions ?? []);

      if (data.message) {
        setScanStats(data.message);
      } else {
        setScanStats(
          `Scanned ${data.emailsScanned ?? 0} emails · ${data.emailsMatched ?? 0} matched · ${data.suggestions?.length ?? 0} suggestion${data.suggestions?.length === 1 ? "" : "s"} found`
        );
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setScanning(false);
    }
  }

  async function handleUpdate(s: Suggestion, origIdx: number) {
    setUpdating(prev => new Set([...prev, origIdx]));
    try {
      const body: Record<string, string> = { id: s.cardId };
      if (s.suggestedDeadline)    body.deadline   = s.suggestedDeadline;
      if (s.suggestedFirst15Date) body.first15_due = s.suggestedFirst15Date;

      const res = await fetch("/api/board", {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });

      if (res.ok) setDismissed(prev => new Set([...prev, origIdx]));
      else        setError("Failed to update card — please try again.");
    } catch {
      setError("Network error updating card.");
    } finally {
      setUpdating(prev => { const n = new Set(prev); n.delete(origIdx); return n; });
    }
  }

  const visible = suggestions.map((s, i) => ({ s, i })).filter(({ i }) => !dismissed.has(i));

  return (
    <section className="rounded-2xl border border-white/8 bg-[#0A0D3A] p-5">

      {/* Success toast */}
      {successToast && (
        <div className="flex items-center gap-2 mb-4 px-3 py-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold">
          <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
          </svg>
          Microsoft email connected successfully
          <button
            onClick={() => setSuccessToast(false)}
            className="ml-auto text-emerald-400/60 hover:text-emerald-300 transition-colors"
            aria-label="Dismiss"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <svg className="h-4 w-4 text-[#D4AF37] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
          </svg>
          <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/50">
            Email Scan
          </h2>
          {connected === true && (
            <span className="text-[10px] text-emerald-400 border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">
              Connected
            </span>
          )}
          {connected === false && (
            <span className="text-[10px] text-white/25 border border-white/10 px-1.5 py-0.5 rounded-full">
              Not connected
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {connected === false && (
            <a
              href="/api/auth/microsoft"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#D4AF37] border border-[#D4AF37]/30 hover:bg-[#D4AF37]/10 px-3 py-1.5 rounded-lg transition-colors"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 23 23" fill="none">
                <path fill="#f25022" d="M0 0h11v11H0z"/>
                <path fill="#00a4ef" d="M12 0h11v11H12z"/>
                <path fill="#7fba00" d="M0 12h11v11H0z"/>
                <path fill="#ffb900" d="M12 12h11v11H12z"/>
              </svg>
              Connect Microsoft Email
            </a>
          )}

          {connected === true && (
            <button
              onClick={handleScan}
              disabled={scanning}
              className="text-xs font-semibold text-white/70 border border-white/15 hover:border-white/35 hover:text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {scanning ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-3 w-3 border border-white/30 border-t-white/70 rounded-full animate-spin"/>
                  Scanning…
                </span>
              ) : "Scan Emails"}
            </button>
          )}
        </div>
      </div>

      {/* Status / error */}
      {error && (
        <p className="text-xs text-red-400/80 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-3">
          {error}
        </p>
      )}
      {scanStats && !error && (
        <p className="text-[11px] text-white/30 mb-4">{scanStats}</p>
      )}

      {/* Empty state when not yet connected */}
      {connected === false && !error && (
        <p className="text-xs text-white/25 mt-1">
          Connect your Microsoft 365 account to scan your inbox for deadline mentions in author emails.
        </p>
      )}

      {/* Suggestion cards */}
      {visible.length > 0 && (
        <div className="space-y-3 mt-1">
          {visible.map(({ s, i }) => {
            const isUpdating = updating.has(i);
            const dateLabel  = (() => {
              try {
                return new Date(s.emailDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
              } catch { return s.emailDate; }
            })();

            return (
              <div
                key={i}
                className="rounded-xl border border-[#D4AF37]/15 bg-[#D4AF37]/5 p-3.5 space-y-2"
              >
                <p className="text-[11px] text-white/40 leading-snug">
                  📧 Email from{" "}
                  <span className="text-white/60 font-medium">{s.senderName}</span>
                  {" "}on {dateLabel}
                </p>

                <p className="text-xs font-semibold text-white/80 leading-snug">
                  {s.emailSubject}
                </p>

                <p className="text-xs font-bold text-[#D4AF37]">{s.bookTitle}</p>

                {s.notes && (
                  <p className="text-[11px] text-white/40 leading-relaxed">{s.notes}</p>
                )}

                <div className="flex flex-wrap gap-2">
                  {s.suggestedDeadline && (
                    <span className="text-[11px] text-white/55 bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">
                      Deadline → {s.suggestedDeadline}
                    </span>
                  )}
                  {s.suggestedFirst15Date && (
                    <span className="text-[11px] text-white/55 bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">
                      First 15 → {s.suggestedFirst15Date}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => handleUpdate(s, i)}
                    disabled={isUpdating}
                    className="text-[11px] font-bold text-black bg-[#D4AF37] hover:bg-[#E0C15A] px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
                  >
                    {isUpdating ? "Updating…" : "Update Card"}
                  </button>
                  <button
                    onClick={() => setDismissed(prev => new Set([...prev, i]))}
                    className="text-[11px] text-white/35 hover:text-white/60 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Ignore
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* All suggestions dismissed */}
      {suggestions.length > 0 && visible.length === 0 && !scanning && (
        <p className="text-[11px] text-white/25 mt-1">All suggestions reviewed ✓</p>
      )}
    </section>
  );
}
