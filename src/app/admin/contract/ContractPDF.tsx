import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

export interface ContractData {
  contractDate: string;
  contractNumber: string;
  authorName: string;
  companyName: string;
  authorEmail: string;
  authorPhone: string;
  authorAddress: string;
  bookTitle: string;
  genre: string;
  wordCount: string;
  finishedHours: string;
  narrationStyle: string;
  characters: string;
  rateType: string;
  rateAmount: string;
  paymentSchedule: string;
  recordingStart: string;
  deliveryDeadline: string;
  pronunciationReceived: boolean;
  pronunciationDate: string;
  pickupDays: string;
  pickupRatePerMinute: string;
  pickupRatePerHour: string;
  aiProtection: string;
  creditLanguage: string;
  marketingPermissions: string;
  cancellationTerms: string;
  rightsGranted: string;
  authorSignatureName: string;
  authorSignatureDate: string;
  narratorSignatureDate: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const fmtDate = (d: string) => {
  if (!d) return "_______________";
  try {
    return new Date(d + "T12:00:00").toLocaleDateString("en-US", {
      month: "long", day: "numeric", year: "numeric",
    });
  } catch { return d; }
};
const fmtRate = (r: string, unit: string) => r ? `$${r} ${unit}` : "___";
const fmtNum  = (n: string) => n ? Number(n).toLocaleString() : "___";
const val     = (v: string, fb = "___") => v?.trim() || fb;
const dash    = (v: string) => v?.trim() || "—";

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page:        { fontFamily: "Helvetica", fontSize: 9.5, color: "#111", paddingTop: 44, paddingBottom: 56, paddingHorizontal: 54, lineHeight: 1.45 },
  headerRow:   { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 },
  co:          { fontFamily: "Helvetica-Bold", fontSize: 13 },
  coSub:       { fontSize: 8, color: "#666", marginTop: 2 },
  metaRight:   { alignItems: "flex-end" },
  metaText:    { fontSize: 8, color: "#555" },
  hr:          { borderBottom: "1pt solid #bbb", marginVertical: 10 },
  hrThin:      { borderBottom: "0.5pt solid #ddd", marginVertical: 6 },
  // title
  title:       { fontFamily: "Helvetica-Bold", fontSize: 15, textAlign: "center", marginBottom: 3 },
  titleSub:    { fontSize: 9, textAlign: "center", color: "#555", marginBottom: 8 },
  intro:       { fontSize: 9.5, lineHeight: 1.55, marginBottom: 10 },
  // deal summary box
  summaryBox:  { backgroundColor: "#f7f7f7", border: "0.5pt solid #ddd", padding: "8pt 12pt", marginBottom: 12 },
  summaryHead: { fontFamily: "Helvetica-Bold", fontSize: 7.5, color: "#888", marginBottom: 5, letterSpacing: 0.5 },
  sumCols:     { flexDirection: "row" },
  sumCol:      { flex: 1 },
  sumRow:      { flexDirection: "row", marginBottom: 3 },
  sumLabel:    { fontFamily: "Helvetica-Bold", fontSize: 8, width: 100, color: "#555", flexShrink: 0 },
  sumValue:    { flex: 1, fontSize: 8 },
  sumTotal:    { fontFamily: "Helvetica-Bold", fontSize: 8.5, color: "#111" },
  // sections
  secHead:     { fontFamily: "Helvetica-Bold", fontSize: 10, marginBottom: 4, marginTop: 10 },
  body:        { fontSize: 9.5, lineHeight: 1.5, marginBottom: 2 },
  bodyIndent:  { fontSize: 9.5, lineHeight: 1.5, marginBottom: 2, marginTop: 4 },
  // schedule A
  schedTitle:  { fontFamily: "Helvetica-Bold", fontSize: 12, marginBottom: 10, textAlign: "center" },
  twoCol:      { flexDirection: "row", marginBottom: 0 },
  col:         { flex: 1 },
  schRow:      { flexDirection: "row", marginBottom: 4 },
  schLabel:    { fontFamily: "Helvetica-Bold", fontSize: 8.5, width: 140, color: "#444", flexShrink: 0 },
  schValue:    { flex: 1, fontSize: 8.5 },
  // signatures
  sigSection:  { flexDirection: "row", marginTop: 28 },
  sigCol:      { flex: 1, marginRight: 16 },
  sigTitle:    { fontFamily: "Helvetica-Bold", fontSize: 9, marginBottom: 6 },
  sigLine:     { borderBottom: "1pt solid #333", marginBottom: 3, marginTop: 22 },
  sigLabel:    { fontSize: 8, color: "#555" },
  sigSub:      { fontSize: 8, color: "#555", marginTop: 5 },
  // footer
  footer:      { position: "absolute", bottom: 22, left: 54, right: 54, textAlign: "center", fontSize: 7.5, color: "#999", borderTop: "0.5pt solid #ddd", paddingTop: 5 },
  pageNum:     { position: "absolute", bottom: 22, right: 54, fontSize: 7, color: "#bbb" },
});

// ── Sub-components ─────────────────────────────────────────────────────────────

function Sec({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <View wrap={false}>
      <Text style={s.secHead}>{n}. {title}</Text>
      {children}
    </View>
  );
}

function SchField({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.schRow}>
      <Text style={s.schLabel}>{label}</Text>
      <Text style={s.schValue}>{value || "________________________"}</Text>
    </View>
  );
}

function SumField({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={s.sumRow}>
      <Text style={s.sumLabel}>{label}</Text>
      <Text style={bold ? s.sumTotal : s.sumValue}>{value || "—"}</Text>
    </View>
  );
}

// Repeating page header used on every page
function PageHeader({ data, company, site }: { data: ContractData; company: string; site: string }) {
  return (
    <>
      <View style={s.headerRow}>
        <View>
          <Text style={s.co}>{company}</Text>
          <Text style={s.coSub}>{`Professional Audiobook Narration${site}`}</Text>
        </View>
        <View style={s.metaRight}>
          <Text style={s.metaText}>Contract No: {val(data.contractNumber, "—")}</Text>
          <Text style={[s.metaText, { marginTop: 2 }]}>Date: {fmtDate(data.contractDate)}</Text>
        </View>
      </View>
      <View style={s.hr} />
    </>
  );
}

// ── Document ───────────────────────────────────────────────────────────────────

export function ContractPDF({ data, template }: { data: ContractData; template?: boolean }) {
  const showChars = data.narrationStyle === "Duet" || data.narrationStyle === "Multicast";

  // Narrator identity — blank for generic template
  const narratorName    = template ? "________________________" : "Dean Miller";
  const narratorCompany = template ? "________________________" : "Dean Miller Narration LLC";
  const narratorEmail   = template ? "________________________" : "dean@dmnarration.com";
  const narratorSite    = template ? "" : " · dmnarration.com";

  // Estimated total (PFH only)
  const rate  = parseFloat(data.rateAmount);
  const hours = parseFloat(data.finishedHours);
  const estimatedTotal = (data.rateType === "Per Finished Hour" && !isNaN(rate) && !isNaN(hours))
    ? rate * hours : null;

  const rateDisplay = data.rateAmount
    ? `$${data.rateAmount}${data.rateType === "Per Finished Hour" ? " / finished hour" : ` (${data.rateType})`}`
    : "—";

  const pronStatus = data.pronunciationReceived
    ? `Yes${data.pronunciationDate ? ` — Date Received: ${fmtDate(data.pronunciationDate)}` : ""}`
    : `No — Please email pronunciation guide to ${narratorEmail} prior to the start of recording.`;
  const pronText = `Pronunciation Guide Received: ${pronStatus}\nNarrator relies on the pronunciation guide for proper character names, world-building terms, and genre-specific language. Changes to pronunciations after recording has begun may be subject to additional pickup fees.`;

  const pickupText = `Narrator will provide included pickups for ${val(data.pickupDays, "30")} days following delivery of final files. Included pickups cover narrator errors: mispronunciations, missed phrases, and technical recording errors — at no additional charge. Manuscript changes, new direction after recording has begun, and post-approval performance preference changes are not included and will be billed at ${fmtRate(data.pickupRatePerMinute, "per finished minute")} or ${fmtRate(data.pickupRatePerHour, "per studio hour")}.`;

  return (
    <Document title={template ? "Audiobook Narration Agreement — Template" : `DMN Contract — ${val(data.bookTitle, "Untitled")}`} author={narratorCompany}>

      {/* ── Page 1: Agreement ──────────────────────────────────────────── */}
      <Page size="LETTER" style={s.page}>
        <PageHeader data={data} company={narratorCompany} site={narratorSite} />

        {/* Keep title, subtitle, rule, and intro together — prevents orphaned title page */}
        <View wrap={false}>
          <Text style={s.title}>AUDIOBOOK NARRATION AGREEMENT</Text>
          <Text style={s.titleSub}>Dean Miller Narration LLC</Text>
          <View style={s.hrThin} />
          <Text style={s.intro}>
            {`This Agreement is entered into as of ${fmtDate(data.contractDate)} between ${val(data.authorName, "[Author Name]")}${data.companyName ? `, ${data.companyName}` : ""} ("Author") and ${narratorName}, ${narratorCompany} ("Narrator").`}
          </Text>
        </View>

        {/* Deal Summary Box — hidden for generic template */}
        {!template && (
          <View style={s.summaryBox}>
            <Text style={s.summaryHead}>DEAL SUMMARY</Text>
            <View style={s.sumCols}>
              <View style={[s.sumCol, { marginRight: 16 }]}>
                <SumField label="Work"         value={dash(data.bookTitle)} />
                <SumField label="Author"       value={dash([data.authorName, data.companyName].filter(Boolean).join(", "))} />
                <SumField label="Narrator"     value={narratorName} />
                <SumField label="Rate"         value={rateDisplay} />
              </View>
              <View style={s.sumCol}>
                <SumField label="Est. Hours"   value={data.finishedHours ? `${data.finishedHours} hrs` : "—"} />
                {estimatedTotal !== null && (
                  <SumField label="Est. Total" value={`$${estimatedTotal.toFixed(2)}`} bold />
                )}
                <SumField label="Start Date"   value={fmtDate(data.recordingStart)} />
                <SumField label="Delivery"     value={fmtDate(data.deliveryDeadline)} />
              </View>
            </View>
          </View>
        )}

        {/* Section 1 */}
        <Sec n={1} title="SERVICES">
          <Text style={s.body}>Narrator agrees to provide audiobook narration services for the Work described in Schedule A.</Text>
        </Sec>

        {/* Section 2 — payment schedule rendered as-is, not embedded in a sentence */}
        <Sec n={2} title="COMPENSATION & PAYMENT">
          <Text style={s.body}>Author will pay Narrator the Fee set forth in Schedule A. Author is responsible for any applicable sales or VAT taxes.</Text>
          {data.paymentSchedule?.trim() && (
            <Text style={s.bodyIndent}>{data.paymentSchedule}</Text>
          )}
        </Sec>

        {/* Section 3 */}
        <Sec n={3} title="SAMPLE APPROVAL">
          <Text style={s.body}>Narrator will provide an initial 15-minute sample before beginning full recording. Author agrees to review and approve or request revisions within 3 calendar days of receipt.</Text>
        </Sec>

        {/* Section 4 — clarified revision boundaries */}
        <Sec n={4} title="REVISIONS & PICKUPS">
          <Text style={s.body}>{pickupText}</Text>
        </Sec>

        {/* Section 5 */}
        <Sec n={5} title="PRONUNCIATION GUIDE">
          <Text style={s.body}>{pronText}</Text>
        </Sec>

        {/* Section 6 */}
        <Sec n={6} title="AI & VOICE PROTECTION">
          <Text style={s.body}>{val(data.aiProtection)}</Text>
        </Sec>

        {/* Section 7 */}
        <Sec n={7} title="CREDIT">
          <Text style={s.body}>{val(data.creditLanguage)}</Text>
        </Sec>

        {/* Section 8 */}
        <Sec n={8} title="MARKETING PERMISSIONS">
          <Text style={s.body}>{val(data.marketingPermissions)}</Text>
        </Sec>

        {/* Section 9 */}
        <Sec n={9} title="RIGHTS">
          <Text style={s.body}>{val(data.rightsGranted)}</Text>
        </Sec>

        {/* Section 10 */}
        <Sec n={10} title="CANCELLATION">
          <Text style={s.body}>{val(data.cancellationTerms)}</Text>
        </Sec>

        {/* Section 11 */}
        <Sec n={11} title="INDEPENDENT CONTRACTOR">
          <Text style={s.body}>Narrator provides services as an independent contractor, not an employee. Author may not deduct taxes from compensation. Narrator retains full discretion over equipment, schedule, and recording methods.</Text>
        </Sec>

        {/* Section 12 */}
        <Sec n={12} title="NON-EXCLUSIVITY">
          <Text style={s.body}>This Agreement is non-exclusive. Nothing herein prevents Narrator from entering into agreements with other authors, publishers, or production companies.</Text>
        </Sec>

        {/* Section 13 */}
        <Sec n={13} title="FORCE MAJEURE">
          <Text style={s.body}>Neither party shall be in breach due to delays caused by fire, flood, war, equipment failure, internet disruption, or other circumstances beyond their reasonable control. Parties will mutually agree on a revised timeline.</Text>
        </Sec>

        {/* Section 14 */}
        <Sec n={14} title="MISCELLANEOUS">
          <Text style={s.body}>This Agreement constitutes the complete agreement between the Parties and supersedes all prior agreements. Any modifications must be in writing and signed by both parties. If any provision is found unenforceable, remaining provisions remain in full force.</Text>
        </Sec>

        <Text style={s.footer}>This agreement is binding upon signature by both parties.</Text>
        <Text style={s.pageNum} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} fixed />
      </Page>

      {/* ── Page 2: Schedule A + Signatures ────────────────────────────── */}
      <Page size="LETTER" style={s.page}>
        <PageHeader data={data} company={narratorCompany} site={narratorSite} />
        <Text style={s.schedTitle}>SCHEDULE A — PRODUCTION DETAILS</Text>

        <View style={s.twoCol}>
          <View style={[s.col, { marginRight: 20 }]}>
            <SchField label="Book Title"          value={data.bookTitle} />
            <SchField label="Author / Publisher"  value={[data.authorName, data.companyName].filter(Boolean).join(", ")} />
            <SchField label="Narrator"            value={narratorName} />
            <SchField label="Genre"               value={data.genre} />
            <SchField label="Word Count"          value={data.wordCount ? `${fmtNum(data.wordCount)} words` : ""} />
            <SchField label="Est. Finished Hours" value={data.finishedHours ? `${data.finishedHours} hrs` : ""} />
            <SchField label="Narration Style"     value={data.narrationStyle} />
            {showChars && <SchField label="Characters / Roles" value={data.characters} />}
            {estimatedTotal !== null && (
              <SchField label="Estimated Total" value={`$${estimatedTotal.toFixed(2)}`} />
            )}
          </View>
          <View style={s.col}>
            <SchField label="Rate Type"           value={data.rateType} />
            <SchField label="Rate Amount"         value={data.rateAmount ? `$${data.rateAmount}` : ""} />
            <SchField label="Recording Start"     value={fmtDate(data.recordingStart)} />
            <SchField label="Delivery Deadline"   value={fmtDate(data.deliveryDeadline)} />
            <SchField label="Pronunciation Guide" value={data.pronunciationReceived ? `Yes — ${fmtDate(data.pronunciationDate)}` : `No — email to ${narratorEmail}`} />
            <SchField label="Included Pickups"    value={`${val(data.pickupDays, "30")} days after delivery`} />
            <SchField label="Add'l Rate / Min"    value={data.pickupRatePerMinute ? `$${data.pickupRatePerMinute}` : ""} />
            <SchField label="Add'l Rate / Hour"   value={data.pickupRatePerHour ? `$${data.pickupRatePerHour}` : ""} />
          </View>
        </View>

        {data.paymentSchedule?.trim() && (
          <View style={{ marginTop: 8 }}>
            <SchField label="Payment Schedule" value={data.paymentSchedule} />
          </View>
        )}

        <View style={[s.hrThin, { marginTop: 10 }]} />

        {/* Signatures */}
        <View style={s.sigSection}>
          <View style={s.sigCol}>
            <Text style={s.sigTitle}>AUTHOR / PUBLISHER</Text>
            <View style={s.sigLine} />
            <Text style={s.sigLabel}>Signature</Text>
            <Text style={[s.sigSub, { marginTop: 10 }]}>
              Print Name: {val(data.authorSignatureName, "________________________________")}
            </Text>
            <Text style={[s.sigSub, { marginTop: 6 }]}>
              Date: {data.authorSignatureDate ? fmtDate(data.authorSignatureDate) : "________________________________"}
            </Text>
            {data.authorAddress && (
              <Text style={[s.sigSub, { marginTop: 6 }]}>Address: {data.authorAddress}</Text>
            )}
          </View>
          <View style={s.sigCol}>
            <Text style={s.sigTitle}>NARRATOR</Text>
            <View style={s.sigLine} />
            <Text style={s.sigLabel}>Signature</Text>
            <Text style={[s.sigSub, { marginTop: 10 }]}>
              {`Print Name: ${narratorName} / ${narratorCompany}`}
            </Text>
            <Text style={[s.sigSub, { marginTop: 6 }]}>
              Date: {data.narratorSignatureDate ? fmtDate(data.narratorSignatureDate) : "________________________________"}
            </Text>
          </View>
        </View>

        <Text style={s.footer}>This agreement is binding upon signature by both parties.</Text>
        <Text style={s.pageNum} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} fixed />
      </Page>
    </Document>
  );
}
