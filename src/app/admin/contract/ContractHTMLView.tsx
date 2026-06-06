"use client";

import type { ContractData } from "./ContractPDF";

interface Props {
  data: ContractData;
  onChange: (key: keyof ContractData, value: string) => void;
}

const BLANK = "_______________";

// Underlined input that looks like a contract blank line.
// Empty blanks have an amber tint to signal "needs filling".
function Blank({
  value,
  onChange,
  type = "text",
  placeholder,
  minW = 120,
}: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  minW?: number;
}) {
  const empty = !value?.trim();
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder ?? BLANK}
      style={{
        display: "inline-block",
        border: "none",
        borderBottom: `1.5px solid ${empty ? "#c8870a" : "#222"}`,
        background: empty ? "rgba(255,185,0,0.08)" : "transparent",
        outline: "none",
        fontFamily: "inherit",
        fontSize: "inherit",
        lineHeight: "inherit",
        color: "inherit",
        padding: "0 3px 1px",
        minWidth: minW,
        width: value ? `${Math.max(value.length * 7.5 + 24, minW)}px` : `${minW}px`,
        verticalAlign: "baseline",
        cursor: "text",
      }}
    />
  );
}

function SecHead({ n, title }: { n: number; title: string }) {
  return (
    <p style={{ fontWeight: "bold", fontSize: "10pt", margin: "12px 0 3px" }}>
      {n}. {title}
    </p>
  );
}

function SchRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", marginBottom: 5, alignItems: "baseline", gap: 6 }}>
      <span style={{ fontWeight: "bold", fontSize: "8.5pt", width: 140, flexShrink: 0, color: "#444" }}>
        {label}
      </span>
      <span style={{ flex: 1, fontSize: "8.5pt" }}>{children}</span>
    </div>
  );
}

function HR({ thin }: { thin?: boolean }) {
  return (
    <div style={{
      borderBottom: thin ? "0.5px solid #ddd" : "1px solid #bbb",
      margin: thin ? "6px 0" : "10px 0",
    }} />
  );
}

export default function ContractHTMLView({ data, onChange }: Props) {
  const fmtDate = (d: string) => {
    if (!d) return null;
    try {
      return new Date(d + "T12:00:00").toLocaleDateString("en-US", {
        month: "long", day: "numeric", year: "numeric",
      });
    } catch { return d; }
  };

  const rate  = parseFloat(data.rateAmount);
  const hours = parseFloat(data.finishedHours);
  const estimatedTotal =
    data.rateType === "Per Finished Hour" && !isNaN(rate) && !isNaN(hours)
      ? rate * hours : null;

  const pickupText =
    `Narrator will provide included pickups for ${data.pickupDays || "30"} days following delivery of final files. ` +
    `Included pickups cover narrator errors: mispronunciations, missed phrases, and technical recording errors — at no additional charge. ` +
    `Manuscript changes, new direction after recording has begun, and post-approval performance preference changes are not included and will be billed at ` +
    `${data.pickupRatePerMinute ? `$${data.pickupRatePerMinute} per finished minute` : BLANK} or ` +
    `${data.pickupRatePerHour ? `$${data.pickupRatePerHour} per studio hour` : BLANK}.`;

  const pronStatus = data.pronunciationReceived
    ? `Yes${data.pronunciationDate ? ` — Date Received: ${fmtDate(data.pronunciationDate)}` : ""}`
    : "No — Please email pronunciation guide to dean@dmnarration.com prior to the start of recording.";

  const metaStyle: React.CSSProperties = { fontSize: "8pt", color: "#555" };

  const on = (k: keyof ContractData) => (v: string) => onChange(k, v);

  return (
    <div style={{ background: "#e0e0e0", padding: 20, height: "100%", overflowY: "auto" }}>
      <div style={{
        fontFamily: "Helvetica, Arial, sans-serif",
        fontSize: "9.5pt",
        color: "#111",
        lineHeight: 1.5,
        background: "white",
        maxWidth: 680,
        margin: "0 auto",
        padding: "54px 54px 48px",
        boxShadow: "0 2px 16px rgba(0,0,0,0.15)",
      }}>

        {/* ══ PAGE 1: Agreement ══ */}

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
          <div>
            <div style={{ fontWeight: "bold", fontSize: 13 }}>Dean Miller Narration LLC</div>
            <div style={{ fontSize: 8, color: "#666", marginTop: 2 }}>Professional Audiobook Narration · dmnarration.com</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={metaStyle}>Contract No: {data.contractNumber || "—"}</div>
            <div style={{ ...metaStyle, marginTop: 2 }}>
              Date:{" "}
              <Blank value={data.contractDate} onChange={on("contractDate")} type="date" minW={90} />
            </div>
          </div>
        </div>
        <HR />

        {/* Title block */}
        <div style={{ fontWeight: "bold", fontSize: 15, textAlign: "center", marginBottom: 3 }}>
          AUDIOBOOK NARRATION AGREEMENT
        </div>
        <div style={{ fontSize: 9, textAlign: "center", color: "#555", marginBottom: 8 }}>
          Dean Miller Narration LLC
        </div>
        <HR thin />

        {/* Parties intro — key fillable fields inline */}
        <p style={{ marginBottom: 10, lineHeight: 1.65 }}>
          This Agreement is entered into as of{" "}
          <Blank value={data.contractDate} onChange={on("contractDate")} type="date" minW={90} />{" "}
          between{" "}
          <Blank value={data.authorName} onChange={on("authorName")} placeholder="Author / Publisher Name" minW={160} />
          {data.companyName
            ? <>, <Blank value={data.companyName} onChange={on("companyName")} placeholder="Company Name" minW={120} /></>
            : null}
          {" "}(&ldquo;Author&rdquo;) and Dean Miller, Dean Miller Narration LLC (&ldquo;Narrator&rdquo;).
        </p>

        {/* Deal summary (shown when any key field has a value) */}
        {(data.bookTitle || data.rateAmount || data.finishedHours || data.deliveryDeadline) && (
          <div style={{ background: "#f7f7f7", border: "0.5px solid #ddd", padding: "8pt 12pt", marginBottom: 12 }}>
            <div style={{ fontWeight: "bold", fontSize: "7.5pt", color: "#888", marginBottom: 5, letterSpacing: 0.5 }}>
              DEAL SUMMARY
            </div>
            <div style={{ display: "flex", gap: 16 }}>
              <div style={{ flex: 1 }}>
                <SchRow label="Work">{data.bookTitle || "—"}</SchRow>
                <SchRow label="Author">{[data.authorName, data.companyName].filter(Boolean).join(", ") || "—"}</SchRow>
                <SchRow label="Narrator">Dean Miller</SchRow>
                <SchRow label="Rate">
                  {data.rateAmount
                    ? `$${data.rateAmount}${data.rateType === "Per Finished Hour" ? " / finished hour" : ` (${data.rateType})`}`
                    : "—"}
                </SchRow>
              </div>
              <div style={{ flex: 1 }}>
                <SchRow label="Est. Hours">{data.finishedHours ? `${data.finishedHours} hrs` : "—"}</SchRow>
                {estimatedTotal !== null && (
                  <SchRow label="Est. Total"><strong>${estimatedTotal.toFixed(2)}</strong></SchRow>
                )}
                <SchRow label="Start Date">{fmtDate(data.recordingStart) || "—"}</SchRow>
                <SchRow label="Delivery">{fmtDate(data.deliveryDeadline) || "—"}</SchRow>
              </div>
            </div>
          </div>
        )}

        {/* ── Sections ── */}
        <SecHead n={1} title="SERVICES" />
        <p style={{ marginBottom: 6 }}>Narrator agrees to provide audiobook narration services for the Work described in Schedule A.</p>

        <SecHead n={2} title="COMPENSATION & PAYMENT" />
        <p style={{ marginBottom: 4 }}>Author will pay Narrator the Fee set forth in Schedule A. Author is responsible for any applicable sales or VAT taxes.</p>
        {data.paymentSchedule?.trim() && (
          <p style={{ marginLeft: 16, marginTop: 4, marginBottom: 6, fontStyle: "italic" }}>{data.paymentSchedule}</p>
        )}

        <SecHead n={3} title="SAMPLE APPROVAL" />
        <p style={{ marginBottom: 6 }}>Narrator will provide an initial 15-minute sample before beginning full recording. Author agrees to review and approve or request revisions within 3 calendar days of receipt.</p>

        <SecHead n={4} title="REVISIONS & PICKUPS" />
        <p style={{ marginBottom: 6 }}>{pickupText}</p>

        <SecHead n={5} title="PRONUNCIATION GUIDE" />
        <p style={{ marginBottom: 6 }}>
          Pronunciation Guide Received: {pronStatus}
          <br />
          Narrator relies on the pronunciation guide for proper character names, world-building terms, and genre-specific language.
        </p>

        <SecHead n={6} title="AI & VOICE PROTECTION" />
        <p style={{ marginBottom: 6 }}>{data.aiProtection || <span style={{ color: "#c8870a" }}>{BLANK}</span>}</p>

        <SecHead n={7} title="CREDIT" />
        <p style={{ marginBottom: 6 }}>{data.creditLanguage || <span style={{ color: "#c8870a" }}>{BLANK}</span>}</p>

        <SecHead n={8} title="MARKETING PERMISSIONS" />
        <p style={{ marginBottom: 6 }}>{data.marketingPermissions || <span style={{ color: "#c8870a" }}>{BLANK}</span>}</p>

        <SecHead n={9} title="RIGHTS" />
        <p style={{ marginBottom: 6 }}>{data.rightsGranted || <span style={{ color: "#c8870a" }}>{BLANK}</span>}</p>

        <SecHead n={10} title="CANCELLATION" />
        <p style={{ marginBottom: 6 }}>{data.cancellationTerms || <span style={{ color: "#c8870a" }}>{BLANK}</span>}</p>

        <SecHead n={11} title="INDEPENDENT CONTRACTOR" />
        <p style={{ marginBottom: 6 }}>Narrator provides services as an independent contractor, not an employee. Author may not deduct taxes from compensation. Narrator retains full discretion over equipment, schedule, and recording methods.</p>

        <SecHead n={12} title="NON-EXCLUSIVITY" />
        <p style={{ marginBottom: 6 }}>This Agreement is non-exclusive. Nothing herein prevents Narrator from entering into agreements with other authors, publishers, or production companies.</p>

        <SecHead n={13} title="FORCE MAJEURE" />
        <p style={{ marginBottom: 6 }}>Neither party shall be in breach due to delays caused by fire, flood, war, equipment failure, internet disruption, or other circumstances beyond their reasonable control.</p>

        <SecHead n={14} title="MISCELLANEOUS" />
        <p style={{ marginBottom: 6 }}>This Agreement constitutes the complete agreement between the Parties and supersedes all prior agreements. Any modifications must be in writing and signed by both parties.</p>

        <div style={{ borderTop: "0.5px solid #ddd", paddingTop: 5, textAlign: "center", fontSize: "7.5pt", color: "#999", marginTop: 24 }}>
          This agreement is binding upon signature by both parties.
        </div>

        {/* Page separator */}
        <div style={{
          margin: "36px -54px",
          padding: "7px 0",
          borderTop: "2px dashed #ccc",
          borderBottom: "2px dashed #ccc",
          textAlign: "center",
          fontSize: "7pt",
          color: "#aaa",
          letterSpacing: "0.12em",
        }}>
          ─── PAGE 2 ───
        </div>

        {/* ══ PAGE 2: Schedule A + Signatures ══ */}

        {/* Header (repeated) */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
          <div>
            <div style={{ fontWeight: "bold", fontSize: 13 }}>Dean Miller Narration LLC</div>
            <div style={{ fontSize: 8, color: "#666", marginTop: 2 }}>Professional Audiobook Narration · dmnarration.com</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={metaStyle}>Contract No: {data.contractNumber || "—"}</div>
            <div style={{ ...metaStyle, marginTop: 2 }}>Date: {fmtDate(data.contractDate) || BLANK}</div>
          </div>
        </div>
        <HR />

        <div style={{ fontWeight: "bold", fontSize: 12, textAlign: "center", marginBottom: 12 }}>
          SCHEDULE A — PRODUCTION DETAILS
        </div>

        {/* Two-column details */}
        <div style={{ display: "flex", gap: 20 }}>
          <div style={{ flex: 1 }}>
            <SchRow label="Book Title">
              <Blank value={data.bookTitle} onChange={on("bookTitle")} placeholder="Book Title" minW={150} />
            </SchRow>
            <SchRow label="Author / Publisher">
              {[data.authorName, data.companyName].filter(Boolean).join(", ") || BLANK}
            </SchRow>
            <SchRow label="Narrator">Dean Miller</SchRow>
            <SchRow label="Genre">
              <Blank value={data.genre} onChange={on("genre")} placeholder="Genre" minW={100} />
            </SchRow>
            <SchRow label="Word Count">
              <Blank value={data.wordCount} onChange={on("wordCount")} placeholder="e.g. 80000" minW={80} />
            </SchRow>
            <SchRow label="Est. Finished Hours">
              <Blank value={data.finishedHours} onChange={on("finishedHours")} placeholder="e.g. 9.5" minW={60} />
            </SchRow>
            <SchRow label="Narration Style">{data.narrationStyle}</SchRow>
            {(data.narrationStyle === "Duet" || data.narrationStyle === "Multicast") && data.characters && (
              <SchRow label="Characters / Roles">{data.characters}</SchRow>
            )}
            {estimatedTotal !== null && (
              <SchRow label="Estimated Total"><strong>${estimatedTotal.toFixed(2)}</strong></SchRow>
            )}
          </div>
          <div style={{ flex: 1 }}>
            <SchRow label="Rate Type">{data.rateType}</SchRow>
            <SchRow label="Rate Amount">
              <Blank
                value={data.rateAmount ? `$${data.rateAmount}` : ""}
                onChange={v => onChange("rateAmount", v.replace(/^\$/, ""))}
                placeholder="$___"
                minW={80}
              />
            </SchRow>
            <SchRow label="Recording Start">
              <Blank value={data.recordingStart} onChange={on("recordingStart")} type="date" minW={100} />
            </SchRow>
            <SchRow label="Delivery Deadline">
              <Blank value={data.deliveryDeadline} onChange={on("deliveryDeadline")} type="date" minW={100} />
            </SchRow>
            <SchRow label="Pronunciation Guide">
              {data.pronunciationReceived
                ? `Yes — ${fmtDate(data.pronunciationDate) || BLANK}`
                : "No — email to dean@dmnarration.com"}
            </SchRow>
            <SchRow label="Included Pickups">
              <Blank value={data.pickupDays} onChange={on("pickupDays")} placeholder="30" minW={40} />{" "}days after delivery
            </SchRow>
            <SchRow label="Add'l Rate / Min">
              <Blank
                value={data.pickupRatePerMinute ? `$${data.pickupRatePerMinute}` : ""}
                onChange={v => onChange("pickupRatePerMinute", v.replace(/^\$/, ""))}
                placeholder="$___"
                minW={70}
              />
            </SchRow>
            <SchRow label="Add'l Rate / Hour">
              <Blank
                value={data.pickupRatePerHour ? `$${data.pickupRatePerHour}` : ""}
                onChange={v => onChange("pickupRatePerHour", v.replace(/^\$/, ""))}
                placeholder="$___"
                minW={70}
              />
            </SchRow>
          </div>
        </div>

        {data.paymentSchedule?.trim() && (
          <div style={{ marginTop: 8 }}>
            <SchRow label="Payment Schedule">{data.paymentSchedule}</SchRow>
          </div>
        )}

        <HR thin />

        {/* Signatures */}
        <div style={{ display: "flex", gap: 16, marginTop: 28 }}>
          <div style={{ flex: 1, marginRight: 16 }}>
            <div style={{ fontWeight: "bold", fontSize: 9, marginBottom: 6 }}>AUTHOR / PUBLISHER</div>
            <div style={{ borderBottom: "1px solid #333", marginTop: 28, marginBottom: 3 }} />
            <div style={{ fontSize: "8pt", color: "#555" }}>Signature</div>
            <div style={{ fontSize: "8pt", color: "#555", marginTop: 10 }}>
              Print Name:{" "}
              <Blank value={data.authorSignatureName} onChange={on("authorSignatureName")} placeholder="Print full name" minW={140} />
            </div>
            <div style={{ fontSize: "8pt", color: "#555", marginTop: 6 }}>
              Date:{" "}
              <Blank value={data.authorSignatureDate} onChange={on("authorSignatureDate")} type="date" minW={100} />
            </div>
            {data.authorAddress && (
              <div style={{ fontSize: "8pt", color: "#555", marginTop: 6 }}>Address: {data.authorAddress}</div>
            )}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: "bold", fontSize: 9, marginBottom: 6 }}>NARRATOR</div>
            <div style={{ borderBottom: "1px solid #333", marginTop: 28, marginBottom: 3 }} />
            <div style={{ fontSize: "8pt", color: "#555" }}>Signature</div>
            <div style={{ fontSize: "8pt", color: "#555", marginTop: 10 }}>
              Print Name: Dean Miller / Dean Miller Narration LLC
            </div>
            <div style={{ fontSize: "8pt", color: "#555", marginTop: 6 }}>
              Date:{" "}
              <Blank value={data.narratorSignatureDate} onChange={on("narratorSignatureDate")} type="date" minW={100} />
            </div>
          </div>
        </div>

        <div style={{ borderTop: "0.5px solid #ddd", paddingTop: 5, textAlign: "center", fontSize: "7.5pt", color: "#999", marginTop: 24 }}>
          This agreement is binding upon signature by both parties.
        </div>

        {/* Usage hint */}
        <div style={{
          marginTop: 16,
          padding: "8px 12px",
          background: "#fffbea",
          border: "1px solid #e0c060",
          borderRadius: 4,
          fontSize: "7.5pt",
          color: "#7a5c00",
        }}>
          Amber-highlighted blanks are unfilled. Click any blank to type directly, or use the form on the left — changes sync instantly.
        </div>

      </div>
    </div>
  );
}
