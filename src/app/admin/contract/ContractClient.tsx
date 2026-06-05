"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type { ContractData } from "./ContractPDF";

// ── Shared input styles ──────────────────────────────────────────────────────

const input = "w-full bg-[#06082E] border border-[#1A2550] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#D4AF37]/50 transition placeholder:text-white/20";
const textarea = `${input} resize-none`;
const select = `${input} appearance-none`;

// ── Small helper components ──────────────────────────────────────────────────

function SectionHead({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3 mt-10 mb-5">
      <h2 className="text-[11px] uppercase tracking-[0.22em] text-[#D4AF37] font-bold whitespace-nowrap">{title}</h2>
      <div className="flex-1 h-px bg-[#1A2550]" />
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-widest text-white/40 font-medium mb-1.5 block">
        {label}{required && <span className="text-[#D4AF37] ml-1">*</span>}
      </span>
      {children}
    </label>
  );
}

function Grid2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>;
}

// ── Default form state ────────────────────────────────────────────────────────

function buildDefaults(): ContractData {
  const today = new Date().toISOString().split("T")[0];
  return {
    contractDate: today,
    contractNumber: "",
    authorName: "",
    companyName: "",
    authorEmail: "",
    authorPhone: "",
    authorAddress: "",
    bookTitle: "",
    genre: "",
    wordCount: "",
    finishedHours: "",
    narrationStyle: "Solo",
    rateType: "Per Finished Hour",
    rateAmount: "",
    paymentSchedule: "",
    paymentTiming: "Payment due within 15 days of invoice. Final payment due before release files are delivered.",
    recordingStart: "",
    deliveryDeadline: "",
    pronunciationReceived: false,
    pronunciationDate: "",
    pickupDays: "30",
    pickupRatePerMinute: "",
    pickupRatePerHour: "",
    rightsGranted: "Author/Publisher is granted exclusive rights to the finished audiobook recording for distribution in all audio formats worldwide.",
    revisionPolicy: "Narrator will perform reasonable pickups for mispronunciations, direction changes, or technical errors within the included pickup window.",
    aiProtection: "Author may not clone, synthesize, train AI models on, or otherwise reproduce Narrator's voice without written consent. Any unauthorized use of Narrator's voice in AI systems constitutes a breach of this agreement.",
    creditLanguage: "Narrator shall be credited as 'Dean Miller' wherever narrator credits are displayed, including retail product pages, press releases, and marketing materials.",
    marketingPermissions: "Narrator may use up to 5 minutes of audio excerpts for portfolio, website, social media, demo reels, and promotional purposes.",
    cancellationTerms: "Before recording begins: no fee due. After recording begins: payment due for all completed finished hours. After 50% completion: minimum 50% of total project payment is due regardless of cancellation.",
    authorSignatureName: "",
    authorSignatureDate: "",
    narratorSignatureDate: "",
  };
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ContractClient() {
  const [form, setForm] = useState<ContractData>(buildDefaults);
  const [generating, setGenerating] = useState(false);

  // Generate contract number once on mount using localStorage counter
  useEffect(() => {
    const year = new Date().getFullYear();
    const key = `dmn_contract_seq_${year}`;
    const n = parseInt(localStorage.getItem(key) ?? "0") + 1;
    localStorage.setItem(key, String(n));
    setForm(prev => ({ ...prev, contractNumber: `DMN-${year}-${String(n).padStart(3, "0")}` }));
  }, []);

  const set = useCallback(<K extends keyof ContractData>(k: K, v: ContractData[K]) => {
    setForm(prev => ({ ...prev, [k]: v }));
  }, []);

  const handleDownload = async () => {
    setGenerating(true);
    try {
      const [{ pdf }, { ContractPDF }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("./ContractPDF"),
      ]);
      const blob = await pdf(<ContractPDF data={form} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const safeName = (form.bookTitle || "Contract").replace(/[^a-zA-Z0-9]+/g, "-");
      a.href = url;
      a.download = `DMN-Contract-${safeName}-${form.contractDate}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("PDF generation error:", err);
      alert("PDF generation failed. Check the console for details.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#06082E] text-white pb-24">

      {/* Top bar */}
      <div className="sticky top-0 z-20 bg-[#06082E]/90 backdrop-blur border-b border-[#1A2550] px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            href="/admin/stats"
            className="text-xs text-white/40 hover:text-white transition-colors flex items-center gap-1"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Admin
          </Link>
          <span className="text-white/20 text-xs">·</span>
          <h1 className="text-sm font-bold text-white">Contract Builder</h1>
          {form.contractNumber && (
            <span className="text-xs text-[#D4AF37]/60 font-mono">{form.contractNumber}</span>
          )}
        </div>
        <button
          onClick={handleDownload}
          disabled={generating}
          className="flex items-center gap-2 bg-[#D4AF37] text-[#06082E] font-bold text-xs px-4 py-2 rounded-full hover:bg-[#F0D060] transition-all active:scale-95 disabled:opacity-50"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          {generating ? "Generating…" : "Download Contract PDF"}
        </button>
      </div>

      {/* Form */}
      <div className="max-w-4xl mx-auto px-5 sm:px-8 pt-8">

        {/* ── Contract Header ── */}
        <SectionHead title="Contract Header" />
        <Grid2>
          <Field label="Contract Date" required>
            <input
              type="date"
              value={form.contractDate}
              onChange={e => set("contractDate", e.target.value)}
              className={input}
            />
          </Field>
          <Field label="Contract Number">
            <input
              type="text"
              value={form.contractNumber}
              onChange={e => set("contractNumber", e.target.value)}
              className={input}
              placeholder="DMN-2026-001"
            />
          </Field>
        </Grid2>

        {/* ── Author/Publisher ── */}
        <SectionHead title="Author / Publisher Information" />
        <div className="space-y-4">
          <Grid2>
            <Field label="Full Name" required>
              <input type="text" value={form.authorName} onChange={e => set("authorName", e.target.value)} className={input} placeholder="Jane Smith" />
            </Field>
            <Field label="Company / Publisher">
              <input type="text" value={form.companyName} onChange={e => set("companyName", e.target.value)} className={input} placeholder="Acme Publishing" />
            </Field>
          </Grid2>
          <Grid2>
            <Field label="Email">
              <input type="email" value={form.authorEmail} onChange={e => set("authorEmail", e.target.value)} className={input} placeholder="author@example.com" />
            </Field>
            <Field label="Phone">
              <input type="tel" value={form.authorPhone} onChange={e => set("authorPhone", e.target.value)} className={input} placeholder="+1 (555) 000-0000" />
            </Field>
          </Grid2>
          <Field label="Address">
            <input type="text" value={form.authorAddress} onChange={e => set("authorAddress", e.target.value)} className={input} placeholder="123 Main St, City, State, ZIP" />
          </Field>
        </div>

        {/* ── Project Details ── */}
        <SectionHead title="Project Details" />
        <div className="space-y-4">
          <Grid2>
            <Field label="Book Title" required>
              <input type="text" value={form.bookTitle} onChange={e => set("bookTitle", e.target.value)} className={input} placeholder="The Title of the Book" />
            </Field>
            <Field label="Genre">
              <input type="text" value={form.genre} onChange={e => set("genre", e.target.value)} className={input} placeholder="Romance / Thriller / Fantasy…" />
            </Field>
          </Grid2>
          <Grid2>
            <Field label="Estimated Word Count">
              <input type="number" value={form.wordCount} onChange={e => set("wordCount", e.target.value)} className={input} placeholder="80000" />
            </Field>
            <Field label="Estimated Finished Hours">
              <input type="number" step="0.5" value={form.finishedHours} onChange={e => set("finishedHours", e.target.value)} className={input} placeholder="9.5" />
            </Field>
          </Grid2>
          <Field label="Narration Style">
            <select value={form.narrationStyle} onChange={e => set("narrationStyle", e.target.value)} className={select}>
              {["Solo", "Dual", "Duet", "Multicast"].map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>
        </div>

        {/* ── Rate & Payment ── */}
        <SectionHead title="Rate & Payment" />
        <div className="space-y-4">
          <Grid2>
            <Field label="Rate Type">
              <select value={form.rateType} onChange={e => set("rateType", e.target.value)} className={select}>
                {["Per Finished Hour", "Flat Fee", "Royalty Share", "RS+"].map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
            <Field label="Rate Amount ($)">
              <input type="number" step="0.01" value={form.rateAmount} onChange={e => set("rateAmount", e.target.value)} className={input} placeholder="250.00" />
            </Field>
          </Grid2>
          <Field label="Payment Schedule">
            <textarea rows={2} value={form.paymentSchedule} onChange={e => set("paymentSchedule", e.target.value)} className={textarea} placeholder="e.g. 50% upfront, 50% on delivery" />
          </Field>
          <Field label="Payment Timing">
            <textarea rows={2} value={form.paymentTiming} onChange={e => set("paymentTiming", e.target.value)} className={textarea} />
          </Field>
        </div>

        {/* ── Delivery ── */}
        <SectionHead title="Delivery" />
        <Grid2>
          <Field label="Recording Start Date">
            <input type="date" value={form.recordingStart} onChange={e => set("recordingStart", e.target.value)} className={input} />
          </Field>
          <Field label="Delivery Deadline">
            <input type="date" value={form.deliveryDeadline} onChange={e => set("deliveryDeadline", e.target.value)} className={input} />
          </Field>
        </Grid2>

        {/* ── Pronunciation Guide ── */}
        <SectionHead title="Pronunciation Guide" />
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <span className="text-[10px] uppercase tracking-widest text-white/40 font-medium">Received</span>
            <div className="flex gap-3">
              {[true, false].map(v => (
                <button
                  key={String(v)}
                  type="button"
                  onClick={() => set("pronunciationReceived", v)}
                  className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-all ${
                    form.pronunciationReceived === v
                      ? "bg-[#D4AF37]/15 border-[#D4AF37]/60 text-[#D4AF37]"
                      : "border-[#1A2550] text-white/40 hover:border-white/30"
                  }`}
                >
                  {v ? "Yes" : "No"}
                </button>
              ))}
            </div>
          </div>
          {form.pronunciationReceived && (
            <Field label="Date Received">
              <input type="date" value={form.pronunciationDate} onChange={e => set("pronunciationDate", e.target.value)} className={`${input} max-w-xs`} />
            </Field>
          )}
        </div>

        {/* ── Included Pickups ── */}
        <SectionHead title="Included Pickups" />
        <Field label="Pickup Window (Days)">
          <div className="flex items-center gap-3 max-w-xs">
            <input type="number" value={form.pickupDays} onChange={e => set("pickupDays", e.target.value)} className={input} placeholder="30" />
          </div>
        </Field>
        <p className="mt-2 text-xs text-white/35 italic">
          Preview: &ldquo;Narrator corrections are included for {form.pickupDays || "30"} days after delivery.&rdquo;
        </p>

        {/* ── Additional Pickup Rate ── */}
        <SectionHead title="Additional Pickup Rate" />
        <Grid2>
          <Field label="Per Finished Minute ($)">
            <input type="number" step="0.01" value={form.pickupRatePerMinute} onChange={e => set("pickupRatePerMinute", e.target.value)} className={input} placeholder="3.50" />
          </Field>
          <Field label="Per Studio Hour ($)">
            <input type="number" step="0.01" value={form.pickupRatePerHour} onChange={e => set("pickupRatePerHour", e.target.value)} className={input} placeholder="150.00" />
          </Field>
        </Grid2>

        {/* ── Rights Granted ── */}
        <SectionHead title="Rights Granted" />
        <textarea rows={3} value={form.rightsGranted} onChange={e => set("rightsGranted", e.target.value)} className={textarea} />

        {/* ── Revision Policy ── */}
        <SectionHead title="Revision Policy" />
        <textarea rows={3} value={form.revisionPolicy} onChange={e => set("revisionPolicy", e.target.value)} className={textarea} />

        {/* ── AI & Voice Protection ── */}
        <SectionHead title="AI & Voice Protection" />
        <textarea rows={4} value={form.aiProtection} onChange={e => set("aiProtection", e.target.value)} className={textarea} />

        {/* ── Credit Language ── */}
        <SectionHead title="Credit Language" />
        <textarea rows={3} value={form.creditLanguage} onChange={e => set("creditLanguage", e.target.value)} className={textarea} />

        {/* ── Marketing Permissions ── */}
        <SectionHead title="Marketing Permissions" />
        <textarea rows={3} value={form.marketingPermissions} onChange={e => set("marketingPermissions", e.target.value)} className={textarea} />

        {/* ── Cancellation Terms ── */}
        <SectionHead title="Cancellation Terms" />
        <textarea rows={4} value={form.cancellationTerms} onChange={e => set("cancellationTerms", e.target.value)} className={textarea} />

        {/* ── Signatures ── */}
        <SectionHead title="Signatures" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
          {/* Author */}
          <div className="space-y-4 bg-[#0B1224] border border-[#1A2550] rounded-xl p-5">
            <p className="text-[11px] uppercase tracking-widest text-[#D4AF37] font-bold">Author / Publisher</p>
            <Field label="Printed Name">
              <input type="text" value={form.authorSignatureName} onChange={e => set("authorSignatureName", e.target.value)} className={input} placeholder="Jane Smith" />
            </Field>
            <Field label="Date">
              <input type="date" value={form.authorSignatureDate} onChange={e => set("authorSignatureDate", e.target.value)} className={input} />
            </Field>
            <div className="border-t border-[#1A2550] pt-4">
              <p className="text-[10px] text-white/20 italic">Signature line will appear in the PDF</p>
            </div>
          </div>

          {/* Narrator */}
          <div className="space-y-4 bg-[#0B1224] border border-[#1A2550] rounded-xl p-5">
            <p className="text-[11px] uppercase tracking-widest text-[#D4AF37] font-bold">Narrator</p>
            <Field label="Printed Name">
              <input type="text" value="Dean Miller, Dean Miller Narration LLC" disabled className={`${input} opacity-50`} />
            </Field>
            <Field label="Date">
              <input type="date" value={form.narratorSignatureDate} onChange={e => set("narratorSignatureDate", e.target.value)} className={input} />
            </Field>
            <div className="border-t border-[#1A2550] pt-4">
              <p className="text-[10px] text-white/20 italic">Signature line will appear in the PDF</p>
            </div>
          </div>
        </div>

        {/* Bottom download */}
        <div className="mt-12 flex justify-center">
          <button
            onClick={handleDownload}
            disabled={generating}
            className="flex items-center gap-2 bg-[#D4AF37] text-[#06082E] font-bold text-sm px-8 py-3.5 rounded-full hover:bg-[#F0D060] transition-all active:scale-95 disabled:opacity-50"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {generating ? "Generating PDF…" : "Download Contract PDF"}
          </button>
        </div>

      </div>
    </main>
  );
}
