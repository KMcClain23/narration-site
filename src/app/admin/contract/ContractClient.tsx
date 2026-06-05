"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { ContractData } from "./ContractPDF";

// ── Live preview — client-only (avoids SSR issues with @react-pdf/renderer) ───

const ContractPreview = dynamic(() => import("./ContractPreview"), {
  ssr: false,
  loading: () => (
    <div className="h-full flex items-center justify-center">
      <p className="text-white/20 text-xs">Loading preview…</p>
    </div>
  ),
});

// ── Input styles ──────────────────────────────────────────────────────────────

const inp  = "w-full bg-[#06082E] border border-[#1A2550] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#D4AF37]/50 transition placeholder:text-white/20";
const ta   = `${inp} resize-none`;
const sel  = `${inp} appearance-none`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function SectionHead({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3 mt-8 mb-4">
      <h2 className="text-[11px] uppercase tracking-[0.22em] text-[#D4AF37] font-bold whitespace-nowrap">{title}</h2>
      <div className="flex-1 h-px bg-[#1A2550]" />
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-widest text-white/40 font-medium mb-1.5 block">
        {label}{required && <span className="text-[#D4AF37] ml-0.5">*</span>}
      </span>
      {children}
    </label>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>;
}

// ── Default state ─────────────────────────────────────────────────────────────

const DEFAULTS: Omit<ContractData, "contractNumber"> = {
  contractDate: new Date().toISOString().split("T")[0],
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
  characters: "",
  rateType: "Per Finished Hour",
  rateAmount: "",
  paymentSchedule: "50% due upon sample approval. Remaining balance due within 14 days of final file delivery. Final payment due before release files are delivered.",
  recordingStart: "",
  deliveryDeadline: "",
  pronunciationReceived: false,
  pronunciationDate: "",
  pickupDays: "30",
  pickupRatePerMinute: "",
  pickupRatePerHour: "",
  aiProtection: "Author may not clone, synthesize, train AI models on, or otherwise reproduce Narrator's voice without written consent. Author shall not utilize any recording or performance of Narrator to simulate Narrator's voice or likeness, or create any synthesized or digital double voice. Author agrees not to sell or transfer any recordings to third parties for AI purposes without Narrator's written consent.",
  creditLanguage: "Narrator shall be credited as 'Dean Miller' wherever narrator credits are displayed, including retail product pages, press releases, and marketing materials.",
  marketingPermissions: "Narrator may use up to 5 minutes of audio excerpts for portfolio, website, social media, demo reels, and promotional purposes in perpetuity.",
  cancellationTerms: "Before recording begins: no fee due. After recording begins: payment due for all completed finished hours at the agreed rate. After 50% completion: minimum 50% of total project payment is due regardless of cancellation. In the event of cancellation, Author agrees to forfeit rights to all recordings and delete all associated files.",
  rightsGranted: "All narration recordings are works made for hire. All copyrights vest in Author upon receipt of full payment. Narrator retains the right to use excerpts per the Marketing Permissions section above.",
  authorSignatureName: "",
  authorSignatureDate: "",
  narratorSignatureDate: "",
};

// ── Main component ────────────────────────────────────────────────────────────

export default function ContractClient() {
  const [form, setForm] = useState<ContractData>({ ...DEFAULTS, contractNumber: "" });
  const [previewData, setPreviewData] = useState<ContractData>(form);
  const [generating, setGenerating] = useState(false);

  // Auto-increment contract number from localStorage
  useEffect(() => {
    const year = new Date().getFullYear();
    const key  = `dmn_contract_seq_${year}`;
    const n    = parseInt(localStorage.getItem(key) ?? "0") + 1;
    localStorage.setItem(key, String(n));
    setForm(prev => ({ ...prev, contractNumber: `DMN-${year}-${String(n).padStart(3, "0")}` }));
  }, []);

  // Debounce preview updates so the PDF isn't regenerated on every keystroke
  useEffect(() => {
    const t = setTimeout(() => setPreviewData(form), 600);
    return () => clearTimeout(t);
  }, [form]);

  const set = useCallback(<K extends keyof ContractData>(k: K, v: ContractData[K]) => {
    setForm(prev => ({ ...prev, [k]: v }));
  }, []);

  const showChars = form.narrationStyle === "Duet" || form.narrationStyle === "Multicast";

  const handleDownload = async () => {
    setGenerating(true);
    try {
      const [{ pdf }, { ContractPDF }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("./ContractPDF"),
      ]);
      const blob = await pdf(<ContractPDF data={form} />).toBlob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      const safe = (form.bookTitle || "Contract").replace(/[^a-zA-Z0-9]+/g, "-");
      a.href     = url;
      a.download = `DMN-${form.contractNumber}-${safe}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("PDF error:", err);
      alert("PDF generation failed — see console for details.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    // Fill viewport below the fixed site header (h-12 sm:h-16)
    <div className="flex bg-[#06082E] text-white overflow-hidden mt-12 sm:mt-16 h-[calc(100dvh-3rem)] sm:h-[calc(100dvh-4rem)]">

      {/* ── LEFT: Form ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden border-r border-[#1A2550]">

        {/* Inner top bar */}
        <div className="shrink-0 flex items-center justify-between gap-3 px-4 sm:px-6 h-12 border-b border-[#1A2550] bg-[#06082E]/90 backdrop-blur">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/admin/stats" className="text-[10px] text-white/30 hover:text-white transition shrink-0">
              ← Admin
            </Link>
            <span className="text-white/15 text-xs">·</span>
            <span className="text-xs font-bold text-white truncate">Contract Builder</span>
            {form.contractNumber && (
              <span className="text-[10px] text-[#D4AF37]/50 font-mono hidden sm:inline">{form.contractNumber}</span>
            )}
          </div>
          <button
            onClick={handleDownload}
            disabled={generating}
            className="shrink-0 flex items-center gap-1.5 bg-[#D4AF37] text-[#06082E] font-bold text-[11px] px-3 py-1.5 rounded-full hover:bg-[#F0D060] transition active:scale-95 disabled:opacity-50"
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {generating ? "Generating…" : "Download PDF"}
          </button>
        </div>

        {/* Scrollable form */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-7 pb-24">

          {/* ── Contract Info ── */}
          <SectionHead title="Contract Info" />
          <Row>
            <Field label="Contract Date" required>
              <input type="date" value={form.contractDate} onChange={e => set("contractDate", e.target.value)} className={inp} />
            </Field>
            <Field label="Contract Number">
              <input type="text" value={form.contractNumber} onChange={e => set("contractNumber", e.target.value)} className={inp} placeholder="DMN-2026-001" />
            </Field>
          </Row>

          {/* ── Author / Publisher ── */}
          <SectionHead title="Author / Publisher" />
          <div className="space-y-4">
            <Row>
              <Field label="Full Name" required>
                <input type="text" value={form.authorName} onChange={e => set("authorName", e.target.value)} className={inp} placeholder="Jane Smith" />
              </Field>
              <Field label="Company Name">
                <input type="text" value={form.companyName} onChange={e => set("companyName", e.target.value)} className={inp} placeholder="Acme Publishing" />
              </Field>
            </Row>
            <Row>
              <Field label="Email">
                <input type="email" value={form.authorEmail} onChange={e => set("authorEmail", e.target.value)} className={inp} placeholder="author@example.com" />
              </Field>
              <Field label="Phone">
                <input type="tel" value={form.authorPhone} onChange={e => set("authorPhone", e.target.value)} className={inp} placeholder="+1 (555) 000-0000" />
              </Field>
            </Row>
            <Field label="Address">
              <input type="text" value={form.authorAddress} onChange={e => set("authorAddress", e.target.value)} className={inp} placeholder="123 Main St, City, State, ZIP" />
            </Field>
          </div>

          {/* ── Project Details ── */}
          <SectionHead title="Project Details" />
          <div className="space-y-4">
            <Row>
              <Field label="Book Title" required>
                <input type="text" value={form.bookTitle} onChange={e => set("bookTitle", e.target.value)} className={inp} placeholder="The Title of the Book" />
              </Field>
              <Field label="Genre">
                <input type="text" value={form.genre} onChange={e => set("genre", e.target.value)} className={inp} placeholder="Romance / Fantasy…" />
              </Field>
            </Row>
            <Row>
              <Field label="Word Count">
                <input type="number" value={form.wordCount} onChange={e => set("wordCount", e.target.value)} className={inp} placeholder="80000" />
              </Field>
              <Field label="Estimated Finished Hours">
                <input type="number" step="0.5" value={form.finishedHours} onChange={e => set("finishedHours", e.target.value)} className={inp} placeholder="9.5" />
              </Field>
            </Row>
            <Row>
              <Field label="Narration Style">
                <select value={form.narrationStyle} onChange={e => set("narrationStyle", e.target.value)} className={sel}>
                  {["Solo", "Dual", "Duet", "Multicast"].map(o => <option key={o}>{o}</option>)}
                </select>
              </Field>
              {showChars && (
                <Field label="Characters / Roles">
                  <input type="text" value={form.characters} onChange={e => set("characters", e.target.value)} className={inp} placeholder="Narrator voices: Aria, Marcus, the Dragon…" />
                </Field>
              )}
            </Row>
          </div>

          {/* ── Rate & Payment ── */}
          <SectionHead title="Rate & Payment" />
          <div className="space-y-4">
            <Row>
              <Field label="Rate Type">
                <select value={form.rateType} onChange={e => set("rateType", e.target.value)} className={sel}>
                  {["Per Finished Hour", "Flat Fee", "Royalty Share", "RS+"].map(o => <option key={o}>{o}</option>)}
                </select>
              </Field>
              <Field label="Rate Amount ($)">
                <input type="number" step="0.01" value={form.rateAmount} onChange={e => set("rateAmount", e.target.value)} className={inp} placeholder="250.00" />
              </Field>
            </Row>
            <Field label="Payment Schedule">
              <textarea rows={3} value={form.paymentSchedule} onChange={e => set("paymentSchedule", e.target.value)} className={ta} />
            </Field>
          </div>

          {/* ── Delivery ── */}
          <SectionHead title="Delivery" />
          <Row>
            <Field label="Recording Start Date">
              <input type="date" value={form.recordingStart} onChange={e => set("recordingStart", e.target.value)} className={inp} />
            </Field>
            <Field label="Delivery Deadline">
              <input type="date" value={form.deliveryDeadline} onChange={e => set("deliveryDeadline", e.target.value)} className={inp} />
            </Field>
          </Row>

          {/* ── Pronunciation Guide ── */}
          <SectionHead title="Pronunciation Guide" />
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <span className="text-[10px] uppercase tracking-widest text-white/40 font-medium">Received</span>
              {([true, false] as const).map(v => (
                <button
                  key={String(v)}
                  type="button"
                  onClick={() => set("pronunciationReceived", v)}
                  className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-all ${
                    form.pronunciationReceived === v
                      ? "bg-[#D4AF37]/15 border-[#D4AF37]/60 text-[#D4AF37]"
                      : "border-[#1A2550] text-white/40 hover:border-white/25"
                  }`}
                >
                  {v ? "Yes" : "No"}
                </button>
              ))}
            </div>
            {form.pronunciationReceived && (
              <Field label="Date Received">
                <input type="date" value={form.pronunciationDate} onChange={e => set("pronunciationDate", e.target.value)} className={`${inp} max-w-xs`} />
              </Field>
            )}
          </div>

          {/* ── Pickups ── */}
          <SectionHead title="Pickups" />
          <div className="space-y-4">
            <Field label="Included Pickup Days">
              <div className="flex items-center gap-3">
                <input type="number" value={form.pickupDays} onChange={e => set("pickupDays", e.target.value)} className={`${inp} max-w-[10rem]`} />
                <span className="text-xs text-white/30 italic whitespace-nowrap">days after delivery</span>
              </div>
            </Field>
            <Row>
              <Field label="Additional Rate — Per Finished Minute ($)">
                <input type="number" step="0.01" value={form.pickupRatePerMinute} onChange={e => set("pickupRatePerMinute", e.target.value)} className={inp} placeholder="3.50" />
              </Field>
              <Field label="Additional Rate — Per Studio Hour ($)">
                <input type="number" step="0.01" value={form.pickupRatePerHour} onChange={e => set("pickupRatePerHour", e.target.value)} className={inp} placeholder="150.00" />
              </Field>
            </Row>
          </div>

          {/* ── Pre-filled editable sections ── */}
          <SectionHead title="AI & Voice Protection" />
          <textarea rows={5} value={form.aiProtection} onChange={e => set("aiProtection", e.target.value)} className={ta} />

          <SectionHead title="Credit Language" />
          <textarea rows={3} value={form.creditLanguage} onChange={e => set("creditLanguage", e.target.value)} className={ta} />

          <SectionHead title="Marketing Permissions" />
          <textarea rows={3} value={form.marketingPermissions} onChange={e => set("marketingPermissions", e.target.value)} className={ta} />

          <SectionHead title="Cancellation Terms" />
          <textarea rows={5} value={form.cancellationTerms} onChange={e => set("cancellationTerms", e.target.value)} className={ta} />

          <SectionHead title="Rights Granted" />
          <textarea rows={3} value={form.rightsGranted} onChange={e => set("rightsGranted", e.target.value)} className={ta} />

          {/* ── Signatures ── */}
          <SectionHead title="Signatures" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="bg-[#0B1224] border border-[#1A2550] rounded-xl p-4 space-y-4">
              <p className="text-[10px] uppercase tracking-widest text-[#D4AF37] font-bold">Author / Publisher</p>
              <Field label="Print Name">
                <input type="text" value={form.authorSignatureName} onChange={e => set("authorSignatureName", e.target.value)} className={inp} placeholder="Jane Smith" />
              </Field>
              <Field label="Signature Date">
                <input type="date" value={form.authorSignatureDate} onChange={e => set("authorSignatureDate", e.target.value)} className={inp} />
              </Field>
            </div>
            <div className="bg-[#0B1224] border border-[#1A2550] rounded-xl p-4 space-y-4">
              <p className="text-[10px] uppercase tracking-widest text-[#D4AF37] font-bold">Narrator</p>
              <Field label="Print Name">
                <input type="text" disabled value="Dean Miller / Dean Miller Narration LLC" className={`${inp} opacity-40`} />
              </Field>
              <Field label="Signature Date">
                <input type="date" value={form.narratorSignatureDate} onChange={e => set("narratorSignatureDate", e.target.value)} className={inp} />
              </Field>
            </div>
          </div>

          {/* Bottom download */}
          <div className="mt-10 flex justify-center">
            <button
              onClick={handleDownload}
              disabled={generating}
              className="flex items-center gap-2 bg-[#D4AF37] text-[#06082E] font-bold text-sm px-8 py-3.5 rounded-full hover:bg-[#F0D060] transition active:scale-95 disabled:opacity-50"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {generating ? "Generating PDF…" : "Download Contract PDF"}
            </button>
          </div>

        </div>
      </div>

      {/* ── RIGHT: Live PDF Preview ─────────────────────────────────────── */}
      <div className="hidden lg:flex w-[46%] flex-col bg-[#050814]">
        <div className="shrink-0 h-12 border-b border-[#1A2550] flex items-center px-5 gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-[#D4AF37]/60" />
          <span className="text-[11px] uppercase tracking-widest text-white/30 font-medium">Live Preview</span>
        </div>
        <div className="flex-1 overflow-hidden">
          <ContractPreview data={previewData} />
        </div>
      </div>

    </div>
  );
}
