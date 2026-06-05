"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { ContractData } from "./ContractPDF";

// ── Live preview ──────────────────────────────────────────────────────────────

const ContractPreview = dynamic(() => import("./ContractPreview"), {
  ssr: false,
  loading: () => (
    <div className="h-full flex items-center justify-center">
      <p className="text-white/20 text-xs">Loading preview…</p>
    </div>
  ),
});

// ── Styles ────────────────────────────────────────────────────────────────────

const inp = "w-full bg-[#06082E] border border-[#1A2550] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#D4AF37]/50 transition placeholder:text-white/20";
const inpErr = "w-full bg-[#06082E] border border-red-500/40 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-400/60 transition placeholder:text-white/20";
const ta  = `${inp} resize-none`;
const sel = `${inp} appearance-none`;

// ── Validation ────────────────────────────────────────────────────────────────

const REQUIRED: { key: keyof ContractData; label: string }[] = [
  { key: "authorName",        label: "Author Name" },
  { key: "bookTitle",         label: "Book Title" },
  { key: "rateAmount",        label: "Rate Amount" },
  { key: "finishedHours",     label: "Estimated Finished Hours" },
  { key: "deliveryDeadline",  label: "Delivery Deadline" },
  { key: "authorSignatureName", label: "Author Signature Name" },
];

function getErrors(form: ContractData) {
  return REQUIRED.filter(({ key }) => !String(form[key] ?? "").trim()).map(({ label }) => label);
}

// ── Draft ─────────────────────────────────────────────────────────────────────

const DRAFT_KEY = "dmn_contract_draft";

function loadDraft(): ContractData | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) return JSON.parse(raw) as ContractData;
  } catch {}
  return null;
}

function newContractNumber(): string {
  const year = new Date().getFullYear();
  const key  = `dmn_contract_seq_${year}`;
  const n    = parseInt(localStorage.getItem(key) ?? "0") + 1;
  localStorage.setItem(key, String(n));
  return `DMN-${year}-${String(n).padStart(3, "0")}`;
}

// ── Defaults ──────────────────────────────────────────────────────────────────

function buildDefaults(): ContractData {
  return {
    contractDate:      new Date().toISOString().split("T")[0],
    contractNumber:    "",
    authorName:        "",
    companyName:       "",
    authorEmail:       "",
    authorPhone:       "",
    authorAddress:     "",
    bookTitle:         "",
    genre:             "",
    wordCount:         "",
    finishedHours:     "",
    narrationStyle:    "Solo",
    characters:        "",
    rateType:          "Per Finished Hour",
    rateAmount:        "",
    paymentSchedule:   "50% due upon sample approval. Remaining balance due within 14 days of final file delivery. Final payment due before release files are delivered.",
    recordingStart:    "",
    deliveryDeadline:  "",
    pronunciationReceived: false,
    pronunciationDate: "",
    pickupDays:        "30",
    pickupRatePerMinute: "",
    pickupRatePerHour:   "",
    aiProtection:      "Author may not clone, synthesize, train AI models on, or otherwise reproduce Narrator's voice without written consent. Author shall not utilize any recording or performance of Narrator to simulate Narrator's voice or likeness, or create any synthesized or digital double voice. Author agrees not to sell or transfer any recordings to third parties for AI purposes without Narrator's written consent.",
    creditLanguage:    "Narrator shall be credited as 'Dean Miller' wherever narrator credits are displayed, including retail product pages, press releases, and marketing materials.",
    marketingPermissions: "Narrator may use up to 5 minutes of audio excerpts for portfolio, website, social media, demo reels, and promotional purposes in perpetuity.",
    cancellationTerms: "Before recording begins: no fee due. After recording begins: payment due for all completed finished hours at the agreed rate. After 50% completion: minimum 50% of total project payment is due regardless of cancellation. In the event of cancellation, Author agrees to forfeit rights to all recordings and delete all associated files.",
    rightsGranted:     "All narration recordings are works made for hire. All copyrights vest in Author upon receipt of full payment. Narrator retains the right to use excerpts per the Marketing Permissions section above.",
    authorSignatureName: "",
    authorSignatureDate: "",
    narratorSignatureDate: "",
  };
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function SectionHead({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3 mt-8 mb-4">
      <h2 className="text-[11px] uppercase tracking-[0.22em] text-[#D4AF37] font-bold whitespace-nowrap">{title}</h2>
      <div className="flex-1 h-px bg-[#1A2550]" />
    </div>
  );
}

function Field({
  label, required, hasError, children,
}: {
  label: string; required?: boolean; hasError?: boolean; children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-widest font-medium mb-1.5 flex items-center justify-between">
        <span className="text-white/40">
          {label}{required && <span className="text-[#D4AF37] ml-0.5">*</span>}
        </span>
        {hasError && <span className="text-red-400 text-[10px] font-bold">Required</span>}
      </span>
      {children}
    </label>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ContractClient() {
  const [form, setForm]               = useState<ContractData>(buildDefaults);
  const [previewData, setPreviewData] = useState<ContractData>(form);
  const [generating, setGenerating]   = useState(false);
  const [previewing, setPreviewing]   = useState(false);
  const [attempted, setAttempted]     = useState(false);
  const [savedAt, setSavedAt]         = useState<string | null>(null);

  // Load draft or generate first contract number on mount
  useEffect(() => {
    const draft = loadDraft();
    if (draft) {
      setForm(draft);
    } else {
      const num = newContractNumber();
      setForm(prev => ({ ...prev, contractNumber: num }));
    }
  }, []);

  // Auto-save draft (debounced 1 s)
  useEffect(() => {
    const t = setTimeout(() => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
      setSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    }, 1000);
    return () => clearTimeout(t);
  }, [form]);

  // Debounce live preview (600 ms)
  useEffect(() => {
    const t = setTimeout(() => setPreviewData(form), 600);
    return () => clearTimeout(t);
  }, [form]);

  const set = useCallback(<K extends keyof ContractData>(k: K, v: ContractData[K]) => {
    setForm(prev => ({ ...prev, [k]: v }));
  }, []);

  // Computed
  const errors        = useMemo(() => getErrors(form), [form]);
  const showChars     = form.narrationStyle === "Duet" || form.narrationStyle === "Multicast";
  const estimatedTotal = useMemo(() => {
    if (form.rateType !== "Per Finished Hour") return null;
    const r = parseFloat(form.rateAmount), h = parseFloat(form.finishedHours);
    return !isNaN(r) && !isNaN(h) ? r * h : null;
  }, [form.rateType, form.rateAmount, form.finishedHours]);

  // Field error helper
  const e = (k: keyof ContractData) => attempted && !String(form[k] ?? "").trim();
  const i = (k: keyof ContractData) => e(k) ? inpErr : inp;

  // ── Actions ───────────────────────────────────────────────────────────────

  const generatePDF = async () => {
    const [{ pdf }, { ContractPDF }] = await Promise.all([
      import("@react-pdf/renderer"),
      import("./ContractPDF"),
    ]);
    return pdf(<ContractPDF data={form} />).toBlob();
  };

  const handleDownload = async () => {
    setAttempted(true);
    if (errors.length > 0) return;
    setGenerating(true);
    try {
      const blob = await generatePDF();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      const safeAuthor = (form.authorName || "Author").replace(/[^a-zA-Z0-9]+/g, "-");
      const safeTitle  = (form.bookTitle  || "Contract").replace(/[^a-zA-Z0-9]+/g, "-");
      a.href     = url;
      a.download = `DMN-${form.contractNumber}-${safeAuthor}-${safeTitle}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("PDF error:", err);
      alert("PDF generation failed — see console.");
    } finally {
      setGenerating(false);
    }
  };

  const handlePreview = async () => {
    setPreviewing(true);
    try {
      const blob = await generatePDF();
      const url  = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (err) {
      console.error("Preview error:", err);
      alert("Preview failed — see console.");
    } finally {
      setPreviewing(false);
    }
  };

  const handleReset = () => {
    if (!window.confirm("Reset the form? All fields will be cleared and a new contract number will be assigned.")) return;
    localStorage.removeItem(DRAFT_KEY);
    const num = newContractNumber();
    setForm({ ...buildDefaults(), contractNumber: num });
    setAttempted(false);
    setSavedAt(null);
  };

  // ── JSX ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex bg-[#06082E] text-white overflow-hidden mt-12 sm:mt-16 h-[calc(100dvh-3rem)] sm:h-[calc(100dvh-4rem)]">

      {/* ── LEFT: Form ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden border-r border-[#1A2550]">

        {/* Top bar */}
        <div className="shrink-0 flex items-center justify-between gap-2 px-4 sm:px-5 h-12 border-b border-[#1A2550] bg-[#06082E]/90 backdrop-blur">
          <div className="flex items-center gap-2 min-w-0 overflow-hidden">
            <Link href="/admin/stats" className="text-[10px] text-white/30 hover:text-white transition shrink-0">← Admin</Link>
            <span className="text-white/15 text-xs shrink-0">·</span>
            <span className="text-xs font-bold text-white shrink-0">Contract Builder</span>
            {form.contractNumber && (
              <span className="text-[10px] text-[#D4AF37]/50 font-mono hidden sm:inline shrink-0">{form.contractNumber}</span>
            )}
            {savedAt && (
              <span className="text-[9px] text-white/20 hidden md:inline truncate">· saved {savedAt}</span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Mobile preview */}
            <button
              onClick={handlePreview}
              disabled={previewing}
              className="lg:hidden flex items-center gap-1 border border-white/15 text-white/50 hover:text-white text-[11px] px-2.5 py-1.5 rounded-full transition disabled:opacity-40"
            >
              {previewing ? "…" : "Preview"}
            </button>
            {/* Reset */}
            <button
              onClick={handleReset}
              className="hidden sm:flex items-center text-[10px] text-white/25 hover:text-white/60 transition px-2 py-1 rounded"
            >
              Reset
            </button>
            {/* Download */}
            <button
              onClick={handleDownload}
              disabled={generating}
              className="flex items-center gap-1.5 bg-[#D4AF37] text-[#06082E] font-bold text-[11px] px-3 py-1.5 rounded-full hover:bg-[#F0D060] transition active:scale-95 disabled:opacity-50"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {generating ? "Generating…" : "Download PDF"}
              {attempted && errors.length > 0 && (
                <span className="bg-red-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center -mr-0.5">
                  {errors.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Validation banner */}
        {attempted && errors.length > 0 && (
          <div className="shrink-0 bg-red-950/60 border-b border-red-500/20 px-4 py-2 text-xs text-red-300">
            Missing required fields: {errors.join(", ")}
          </div>
        )}

        {/* Scrollable form */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-7 pb-24">

          {/* Contract Info */}
          <SectionHead title="Contract Info" />
          <Row>
            <Field label="Contract Date" required hasError={e("contractDate")}>
              <input type="date" value={form.contractDate} onChange={ev => set("contractDate", ev.target.value)} className={i("contractDate")} />
            </Field>
            <Field label="Contract Number">
              <input type="text" value={form.contractNumber} onChange={ev => set("contractNumber", ev.target.value)} className={inp} placeholder="DMN-2026-001" />
            </Field>
          </Row>

          {/* Author / Publisher */}
          <SectionHead title="Author / Publisher" />
          <div className="space-y-4">
            <Row>
              <Field label="Full Name" required hasError={e("authorName")}>
                <input type="text" value={form.authorName} onChange={ev => set("authorName", ev.target.value)} className={i("authorName")} placeholder="Jane Smith" />
              </Field>
              <Field label="Company Name">
                <input type="text" value={form.companyName} onChange={ev => set("companyName", ev.target.value)} className={inp} placeholder="Acme Publishing" />
              </Field>
            </Row>
            <Row>
              <Field label="Email">
                <input type="email" value={form.authorEmail} onChange={ev => set("authorEmail", ev.target.value)} className={inp} placeholder="author@example.com" />
              </Field>
              <Field label="Phone">
                <input type="tel" value={form.authorPhone} onChange={ev => set("authorPhone", ev.target.value)} className={inp} placeholder="+1 (555) 000-0000" />
              </Field>
            </Row>
            <Field label="Address">
              <input type="text" value={form.authorAddress} onChange={ev => set("authorAddress", ev.target.value)} className={inp} placeholder="123 Main St, City, State, ZIP" />
            </Field>
          </div>

          {/* Project Details */}
          <SectionHead title="Project Details" />
          <div className="space-y-4">
            <Row>
              <Field label="Book Title" required hasError={e("bookTitle")}>
                <input type="text" value={form.bookTitle} onChange={ev => set("bookTitle", ev.target.value)} className={i("bookTitle")} placeholder="The Title of the Book" />
              </Field>
              <Field label="Genre">
                <input type="text" value={form.genre} onChange={ev => set("genre", ev.target.value)} className={inp} placeholder="Romance / Fantasy…" />
              </Field>
            </Row>
            <Row>
              <Field label="Word Count">
                <input type="number" value={form.wordCount} onChange={ev => set("wordCount", ev.target.value)} className={inp} placeholder="80000" />
              </Field>
              <Field label="Estimated Finished Hours" required hasError={e("finishedHours")}>
                <input type="number" step="0.5" value={form.finishedHours} onChange={ev => set("finishedHours", ev.target.value)} className={i("finishedHours")} placeholder="9.5" />
              </Field>
            </Row>
            <Row>
              <Field label="Narration Style">
                <select value={form.narrationStyle} onChange={ev => set("narrationStyle", ev.target.value)} className={sel}>
                  {["Solo", "Dual", "Duet", "Multicast"].map(o => <option key={o}>{o}</option>)}
                </select>
              </Field>
              {showChars && (
                <Field label="Characters / Roles">
                  <input type="text" value={form.characters} onChange={ev => set("characters", ev.target.value)} className={inp} placeholder="Aria, Marcus, the Dragon…" />
                </Field>
              )}
            </Row>
          </div>

          {/* Rate & Payment */}
          <SectionHead title="Rate & Payment" />
          <div className="space-y-4">
            <Row>
              <Field label="Rate Type">
                <select value={form.rateType} onChange={ev => set("rateType", ev.target.value)} className={sel}>
                  {["Per Finished Hour", "Flat Fee", "Royalty Share", "RS+"].map(o => <option key={o}>{o}</option>)}
                </select>
              </Field>
              <Field label="Rate Amount ($)" required hasError={e("rateAmount")}>
                <input type="number" step="0.01" value={form.rateAmount} onChange={ev => set("rateAmount", ev.target.value)} className={i("rateAmount")} placeholder="250.00" />
              </Field>
            </Row>

            {/* Estimated total */}
            {estimatedTotal !== null && (
              <div className="flex items-center justify-between bg-[#D4AF37]/5 border border-[#D4AF37]/20 rounded-lg px-4 py-3">
                <span className="text-xs text-white/50">Estimated Project Total ({form.finishedHours} hrs × ${form.rateAmount})</span>
                <span className="text-base font-bold text-[#D4AF37]">${estimatedTotal.toFixed(2)}</span>
              </div>
            )}

            <Field label="Payment Schedule">
              <textarea rows={3} value={form.paymentSchedule} onChange={ev => set("paymentSchedule", ev.target.value)} className={ta} />
            </Field>
          </div>

          {/* Delivery */}
          <SectionHead title="Delivery" />
          <Row>
            <Field label="Recording Start Date">
              <input type="date" value={form.recordingStart} onChange={ev => set("recordingStart", ev.target.value)} className={inp} />
            </Field>
            <Field label="Delivery Deadline" required hasError={e("deliveryDeadline")}>
              <input type="date" value={form.deliveryDeadline} onChange={ev => set("deliveryDeadline", ev.target.value)} className={i("deliveryDeadline")} />
            </Field>
          </Row>

          {/* Pronunciation Guide */}
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
                <input type="date" value={form.pronunciationDate} onChange={ev => set("pronunciationDate", ev.target.value)} className={`${inp} max-w-xs`} />
              </Field>
            )}
          </div>

          {/* Pickups */}
          <SectionHead title="Pickups" />
          <div className="space-y-4">
            <Field label="Included Pickup Days">
              <div className="flex items-center gap-3">
                <input type="number" value={form.pickupDays} onChange={ev => set("pickupDays", ev.target.value)} className={`${inp} max-w-[10rem]`} />
                <span className="text-xs text-white/30 italic whitespace-nowrap">days after delivery</span>
              </div>
            </Field>
            <Row>
              <Field label="Additional Rate — Per Finished Minute ($)">
                <input type="number" step="0.01" value={form.pickupRatePerMinute} onChange={ev => set("pickupRatePerMinute", ev.target.value)} className={inp} placeholder="3.50" />
              </Field>
              <Field label="Additional Rate — Per Studio Hour ($)">
                <input type="number" step="0.01" value={form.pickupRatePerHour} onChange={ev => set("pickupRatePerHour", ev.target.value)} className={inp} placeholder="150.00" />
              </Field>
            </Row>
          </div>

          {/* Pre-filled legal sections */}
          <SectionHead title="AI & Voice Protection" />
          <textarea rows={5} value={form.aiProtection} onChange={ev => set("aiProtection", ev.target.value)} className={ta} />

          <SectionHead title="Credit Language" />
          <textarea rows={3} value={form.creditLanguage} onChange={ev => set("creditLanguage", ev.target.value)} className={ta} />

          <SectionHead title="Marketing Permissions" />
          <textarea rows={3} value={form.marketingPermissions} onChange={ev => set("marketingPermissions", ev.target.value)} className={ta} />

          <SectionHead title="Cancellation Terms" />
          <textarea rows={5} value={form.cancellationTerms} onChange={ev => set("cancellationTerms", ev.target.value)} className={ta} />

          <SectionHead title="Rights Granted" />
          <textarea rows={3} value={form.rightsGranted} onChange={ev => set("rightsGranted", ev.target.value)} className={ta} />

          {/* Signatures */}
          <SectionHead title="Signatures" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="bg-[#0B1224] border border-[#1A2550] rounded-xl p-4 space-y-4">
              <p className="text-[10px] uppercase tracking-widest text-[#D4AF37] font-bold">Author / Publisher</p>
              <Field label="Print Name" required hasError={e("authorSignatureName")}>
                <input type="text" value={form.authorSignatureName} onChange={ev => set("authorSignatureName", ev.target.value)} className={i("authorSignatureName")} placeholder="Jane Smith" />
              </Field>
              <Field label="Signature Date">
                <input type="date" value={form.authorSignatureDate} onChange={ev => set("authorSignatureDate", ev.target.value)} className={inp} />
              </Field>
            </div>
            <div className="bg-[#0B1224] border border-[#1A2550] rounded-xl p-4 space-y-4">
              <p className="text-[10px] uppercase tracking-widest text-[#D4AF37] font-bold">Narrator</p>
              <Field label="Print Name">
                <input type="text" disabled value="Dean Miller / Dean Miller Narration LLC" className={`${inp} opacity-40`} />
              </Field>
              <Field label="Signature Date">
                <input type="date" value={form.narratorSignatureDate} onChange={ev => set("narratorSignatureDate", ev.target.value)} className={inp} />
              </Field>
            </div>
          </div>

          {/* Bottom actions */}
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
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
            <button
              onClick={handlePreview}
              disabled={previewing}
              className="lg:hidden flex items-center gap-2 border border-white/20 text-white/60 hover:text-white text-sm px-6 py-3.5 rounded-full transition disabled:opacity-40"
            >
              {previewing ? "Opening…" : "Preview PDF"}
            </button>
            <button
              onClick={handleReset}
              className="text-xs text-white/20 hover:text-white/50 transition"
            >
              Reset form
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
