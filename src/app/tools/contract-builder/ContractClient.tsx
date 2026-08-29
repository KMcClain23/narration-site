"use client";
import { formatTimeOfDay } from "@/lib/timezone";
import { studioRates, useStudioSettings } from "@/components/admin/useStudioSettings";

import { useState, useEffect, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import type { ContractData } from "./ContractPDF";

// ── Live preview (PDF viewer) ─────────────────────────────────────────────────

const ContractPreview = dynamic(() => import("./ContractPreview"), {
  ssr: false,
  loading: () => (
    <div className="h-full flex items-center justify-center">
      <p className="text-text-faint text-xs">Loading preview…</p>
    </div>
  ),
});

// ── Styles ────────────────────────────────────────────────────────────────────

const base = "w-full rounded-xl px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-dim focus:outline-none transition-colors";
const inp    = `${base} bg-surface border border-surface-border focus:border-accent-amber-dim`;
const inpErr = `${base} bg-surface border border-alert-red/55 focus:border-alert-red/75`;
const ta     = `${inp} resize-none leading-relaxed`;
const sel    = `${inp} appearance-none contract-select cursor-pointer`;

// ── Validation ────────────────────────────────────────────────────────────────

const REQUIRED: { key: keyof ContractData; label: string }[] = [
  { key: "authorName",        label: "Author Name" },
  { key: "bookTitle",         label: "Book Title" },
  { key: "rateAmount",        label: "Rate Amount" },
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
    paymentSchedule:   "Payment due in full within 14 days of final file delivery.",
    recordingStart:    "",
    first15Due:        "",
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
    narratorSignatureDate: new Date().toISOString().split("T")[0],
  };
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function SectionHead({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2.5 mt-10 mb-4">
      <div className="w-0.5 h-[14px] rounded-full bg-accent-amber/65 shrink-0" />
      <h2 className="text-[11px] uppercase tracking-[0.22em] text-accent-amber-bright font-bold whitespace-nowrap">{title}</h2>
      <div className="flex-1 h-px bg-gradient-to-r from-surface-border to-transparent" />
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
      <span className="flex items-center justify-between mb-1.5">
        <span className="text-[10.5px] uppercase tracking-[0.14em] font-semibold text-text-muted">
          {label}{required && <span className="text-accent-amber-bright ml-0.5">*</span>}
        </span>
        {hasError && (
          <span className="flex items-center gap-1 text-[10px] font-semibold text-alert-red">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-alert-red shrink-0" />
            Required
          </span>
        )}
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
  const studioState                        = useStudioSettings();
  // Nullable rates: loading and failed both yield null, and every figure below
  // is gated on that rather than computed from a default.
  const studio                        = studioRates(studioState);
  const [form, setForm]               = useState<ContractData>(buildDefaults);
  const [previewData, setPreviewData] = useState<ContractData>(buildDefaults);
  const [generating, setGenerating]   = useState(false);
  const [previewing, setPreviewing]   = useState(false);
  const [attempted, setAttempted]     = useState(false);
  const [savedAt, setSavedAt]         = useState<string | null>(null);

  // Load draft or generate first contract number on mount
  useEffect(() => {
    const draft = loadDraft();
    if (draft) {
      // Ensure sig name stays in sync with author name on draft restore
      if (!draft.authorSignatureName || draft.authorSignatureName === draft.authorName) {
        draft.authorSignatureName = draft.authorName;
      }
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
      setSavedAt(formatTimeOfDay(new Date()));
    }, 1000);
    return () => clearTimeout(t);
  }, [form]);

  // Debounce live preview (600 ms)
  useEffect(() => {
    const t = setTimeout(() => setPreviewData(form), 600);
    return () => clearTimeout(t);
  }, [form]);

  // Auto-calculate finishedHours from wordCount, using the divisor from Settings.
  //
  // This comment used to assert "the real number has always been 9,400". That was
  // never a fact about the code — it was a belief, and this file had already billed
  // at a stale 9,300 while the rest of the app used something else. It is now false
  // outright: the number is whatever `studio_words_per_finished_hour` says, and
  // changing that setting moves this field with everything else. Which is the whole
  // point of W1 — the value agreed with five hardcodes by coincidence, not by wiring.
  useEffect(() => {
    const wc = parseFloat(form.wordCount);
    if (!wc || isNaN(wc)) return;
    // Without the rate the field is left alone rather than filled from a guess.
    // A contract builder that pre-fills finished hours from a default produces a
    // document someone signs, and the number would be indistinguishable from one
    // Dean had worked out.
    const rate = studio.wordsPerFinishedHour;
    if (rate == null) return;
    set("finishedHours", (wc / rate).toFixed(1));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.wordCount, studio.wordsPerFinishedHour]);

  // Keep authorSignatureName in sync with authorName unless manually diverged
  useEffect(() => {
    setForm(prev => {
      if (!prev.authorSignatureName.trim() || prev.authorSignatureName === prev.authorName) {
        return { ...prev, authorSignatureName: form.authorName };
      }
      return prev;
    });
  }, [form.authorName]);

  const set = useCallback(<K extends keyof ContractData>(k: K, v: ContractData[K]) => {
    setForm(prev => ({ ...prev, [k]: v }));
  }, []);

  // Computed
  const errors        = useMemo(() => getErrors(form), [form]);
  const showChars     = form.narrationStyle === "Duet" || form.narrationStyle === "Multicast";
  const isDuet = form.narrationStyle === "Duet";
  const estimatedTotal = useMemo(() => {
    if (form.rateType !== "Per Finished Hour") return null;
    const r = parseFloat(form.rateAmount), h = parseFloat(form.finishedHours);
    if (isNaN(r) || isNaN(h)) return null;
    return isDuet ? (r * h) / 2 : r * h;
  }, [form.rateType, form.rateAmount, form.finishedHours, isDuet]);

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
      a.download = `${form.contractNumber}-${safeAuthor}-${safeTitle}.pdf`;
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

  const handleGenericDownload = async () => {
    setGenerating(true);
    try {
      const [{ pdf }, { ContractPDF }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("./ContractPDF"),
      ]);
      // Strip all identifiable info; generalize credit language
      const templateData = {
        ...buildDefaults(),
        contractNumber: "",
        creditLanguage: "Narrator shall be credited as '________________' wherever narrator credits are displayed, including retail product pages, press releases, and marketing materials.",
      };
      const blob = await pdf(<ContractPDF data={templateData} template />).toBlob();
      const url  = URL.createObjectURL(blob);
      const a        = document.createElement("a");
      a.href     = url;
      a.download = "Generic-Audiobook-Narration-Agreement.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Generic template error:", err);
      alert("Template generation failed.");
    } finally {
      setGenerating(false);
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
    <div className="flex bg-background text-text-primary overflow-hidden rounded-xl border border-surface-border h-[calc(100vh-4rem)]">

      {/* ── LEFT: Form ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden border-r border-surface-border">

        {/* Top bar */}
        <div className="shrink-0 flex items-center justify-between gap-2 px-4 sm:px-5 h-12 border-b border-surface-border bg-surface/60 backdrop-blur">
          <div className="flex items-center gap-2 min-w-0 overflow-hidden">
            <span className="text-xs font-bold text-text-primary shrink-0">Contract Builder</span>
            {form.contractNumber && (
              <span className="text-[10px] text-accent-amber-bright/60 font-mono hidden sm:inline shrink-0">{form.contractNumber}</span>
            )}
            {savedAt && (
              <span className="text-[9px] text-text-faint hidden md:inline truncate">· saved {savedAt}</span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Mobile preview */}
            <button
              onClick={handlePreview}
              disabled={previewing}
              className="lg:hidden flex items-center gap-1 border border-surface-border text-text-muted hover:text-text-primary text-[11px] px-2.5 py-1.5 rounded-full transition disabled:opacity-40"
            >
              {previewing ? "…" : "Preview"}
            </button>
            {/* Reset */}
            <button
              onClick={handleReset}
              className="hidden sm:flex items-center text-[10px] text-text-faint hover:text-text-muted transition px-2 py-1 rounded"
            >
              Reset
            </button>
            {/* Download */}
            <button
              onClick={handleDownload}
              disabled={generating}
              className="flex items-center gap-1.5 bg-accent-amber text-background font-bold text-[11px] px-3 py-1.5 rounded-full hover:brightness-110 transition active:scale-95 disabled:opacity-50"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {generating ? "Generating…" : "Download PDF"}
              {attempted && errors.length > 0 && (
                <span className="bg-alert-red text-text-primary text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center -mr-0.5">
                  {errors.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Validation banner */}
        {attempted && errors.length > 0 && (
          <div className="shrink-0 bg-alert-red/10 border-b border-alert-red/20 px-4 py-2 text-xs text-alert-red">
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
              <Field label={`Estimated Finished Hours${form.wordCount ? " (auto)" : ""}`}>
                <input type="number" step="0.1" value={form.finishedHours} onChange={ev => set("finishedHours", ev.target.value)} className={inp} placeholder="9.5" />
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
              <div className="flex items-center justify-between bg-accent-amber/5 border border-accent-amber/25 rounded-xl px-4 py-3">
                <span className="text-xs text-text-muted">
                  {isDuet ? "Est. Narrator Total (½ duet)" : "Estimated Project Total"}{" "}
                  ({form.finishedHours} hrs × ${form.rateAmount}{isDuet ? " ÷ 2" : ""})
                </span>
                <span className="text-base font-bold text-accent-amber-bright">${estimatedTotal.toFixed(2)}</span>
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
            <Field label="First 15 Minutes Due">
              <input type="date" value={form.first15Due} onChange={ev => set("first15Due", ev.target.value)} className={inp} />
            </Field>
          </Row>
          <Row>
            <Field label="Delivery Deadline" required hasError={e("deliveryDeadline")}>
              <input type="date" value={form.deliveryDeadline} onChange={ev => set("deliveryDeadline", ev.target.value)} className={i("deliveryDeadline")} />
            </Field>
          </Row>

          {/* Pronunciation Guide */}
          <SectionHead title="Pronunciation Guide" />
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <span className="text-[10.5px] uppercase tracking-[0.14em] text-text-muted font-semibold">Received</span>
              {([true, false] as const).map(v => (
                <button
                  key={String(v)}
                  type="button"
                  onClick={() => set("pronunciationReceived", v)}
                  className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-all ${
                    form.pronunciationReceived === v
                      ? "bg-accent-amber/15 border-accent-amber/60 text-accent-amber-bright"
                      : "border-surface-border text-text-dim hover:text-text-muted"
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
                <span className="text-xs text-text-dim italic whitespace-nowrap">days after delivery</span>
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
            <div className="bg-surface border border-surface-border rounded-xl p-4 space-y-4">
              <p className="text-[10.5px] uppercase tracking-[0.14em] text-accent-amber-bright/80 font-bold">Author / Publisher</p>
              <Field label="Print Name" required hasError={e("authorSignatureName")}>
                <input type="text" value={form.authorSignatureName} onChange={ev => set("authorSignatureName", ev.target.value)} className={i("authorSignatureName")} placeholder="Jane Smith" />
              </Field>
              <Field label="Signature Date">
                <input type="date" value={form.authorSignatureDate} onChange={ev => set("authorSignatureDate", ev.target.value)} className={inp} />
              </Field>
            </div>
            <div className="bg-surface border border-surface-border rounded-xl p-4 space-y-4">
              <p className="text-[10.5px] uppercase tracking-[0.14em] text-accent-amber-bright/80 font-bold">Narrator</p>
              <Field label="Print Name">
                <input type="text" disabled value="Dean Miller / Dean Miller Narration LLC" className={`${inp} opacity-40`} />
              </Field>
              <Field label="Signature Date">
                <input type="date" value={form.narratorSignatureDate} onChange={ev => set("narratorSignatureDate", ev.target.value)} className={inp} />
              </Field>
            </div>
          </div>

          {/* Bottom actions */}
          <div className="mt-10 flex flex-col items-center gap-3">
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <button
                onClick={handleDownload}
                disabled={generating}
                className="flex items-center gap-2 bg-accent-amber text-background font-bold text-sm px-8 py-3.5 rounded-full hover:brightness-110 transition active:scale-95 disabled:opacity-50"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                {generating ? "Generating PDF…" : "Download Contract PDF"}
              </button>
              <button
                onClick={handlePreview}
                disabled={previewing}
                className="lg:hidden flex items-center gap-2 border border-surface-border text-text-muted hover:text-text-primary text-sm px-6 py-3.5 rounded-full transition disabled:opacity-40"
              >
                {previewing ? "Opening…" : "Preview PDF"}
              </button>
            </div>

            {/* Generic template */}
            <button
              onClick={handleGenericDownload}
              disabled={generating}
              className="flex items-center gap-2 border border-surface-border text-text-dim hover:text-text-muted transition text-xs px-5 py-2 rounded-full disabled:opacity-30"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Download Generic Template (for other narrators)
            </button>

            <button
              onClick={handleReset}
              className="text-xs text-text-faint hover:text-text-muted transition"
            >
              Reset form
            </button>
          </div>

        </div>
      </div>

      {/* ── RIGHT: Live PDF Preview ─────────────────────────────────────── */}
      <div className="hidden lg:flex w-[46%] flex-col bg-background">
        <div className="shrink-0 h-12 border-b border-surface-border flex items-center px-5 gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-accent-amber/60" />
          <span className="text-[11px] uppercase tracking-widest text-text-dim font-medium">Live Preview</span>
        </div>
        <div className="flex-1 overflow-hidden">
          <ContractPreview data={previewData} />
        </div>
      </div>

    </div>
  );
}
