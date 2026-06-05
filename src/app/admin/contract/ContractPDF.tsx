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
  rateType: string;
  rateAmount: string;
  paymentSchedule: string;
  paymentTiming: string;
  recordingStart: string;
  deliveryDeadline: string;
  pronunciationReceived: boolean;
  pronunciationDate: string;
  pickupDays: string;
  pickupRatePerMinute: string;
  pickupRatePerHour: string;
  rightsGranted: string;
  revisionPolicy: string;
  aiProtection: string;
  creditLanguage: string;
  marketingPermissions: string;
  cancellationTerms: string;
  authorSignatureName: string;
  authorSignatureDate: string;
  narratorSignatureDate: string;
}

const s = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 9, color: "#1a1a1a", paddingTop: 48, paddingBottom: 60, paddingHorizontal: 50, lineHeight: 1.45 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 },
  company: { fontFamily: "Helvetica-Bold", fontSize: 14 },
  subtitle: { fontSize: 8, color: "#666", marginTop: 2 },
  contractMeta: { textAlign: "right" },
  contractTitle: { fontFamily: "Helvetica-Bold", fontSize: 16, textAlign: "center", marginTop: 6, marginBottom: 2 },
  contractNum: { fontSize: 8, color: "#666", textAlign: "center", marginBottom: 4 },
  divider: { borderBottom: "1pt solid #ccc", marginBottom: 14, marginTop: 4 },
  thinDivider: { borderBottom: "0.5pt solid #e0e0e0", marginBottom: 10 },
  sectionHead: { fontFamily: "Helvetica-Bold", fontSize: 8.5, color: "#333", textTransform: "uppercase", letterSpacing: 0.8, marginTop: 14, marginBottom: 5, borderBottom: "0.5pt solid #ccc", paddingBottom: 3 },
  row: { flexDirection: "row", marginBottom: 3 },
  twoCol: { flexDirection: "row", gap: 20 },
  col: { flex: 1 },
  label: { fontFamily: "Helvetica-Bold", fontSize: 8, width: 130, color: "#444", flexShrink: 0 },
  value: { flex: 1, fontSize: 8.5 },
  para: { fontSize: 8.5, marginBottom: 5, lineHeight: 1.55 },
  sigSection: { flexDirection: "row", marginTop: 28, gap: 24 },
  sigCol: { flex: 1 },
  sigLine: { borderBottom: "1pt solid #333", marginBottom: 3, marginTop: 24 },
  sigLabel: { fontFamily: "Helvetica-Bold", fontSize: 7.5, color: "#555", marginBottom: 2 },
  sigSub: { fontSize: 7.5, color: "#777" },
  footer: { position: "absolute", bottom: 24, left: 50, right: 50, textAlign: "center", fontSize: 7.5, color: "#999", borderTop: "0.5pt solid #ddd", paddingTop: 6 },
  pageNum: { position: "absolute", bottom: 24, right: 50, fontSize: 7, color: "#bbb" },
  empty: { color: "#aaa", fontFamily: "Helvetica-Oblique" },
});

const val = (v: string, fallback = "—") => v?.trim() || fallback;
const date = (d: string) => d ? new Date(d + "T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "—";

function Field({ label, value }: { label: string; value: string }) {
  const empty = !value?.trim();
  return (
    <View style={s.row}>
      <Text style={s.label}>{label}</Text>
      <Text style={[s.value, empty ? s.empty : {}]}>{empty ? "—" : value}</Text>
    </View>
  );
}

export function ContractPDF({ data }: { data: ContractData }) {
  const pickupText = `Narrator corrections are included for ${val(data.pickupDays, "30")} days after delivery.`;

  return (
    <Document title={`DMN Contract — ${val(data.bookTitle, "Untitled")}`} author="Dean Miller Narration LLC">
      <Page size="LETTER" style={s.page}>

        {/* Header */}
        <View style={s.headerRow}>
          <View>
            <Text style={s.company}>Dean Miller Narration LLC</Text>
            <Text style={s.subtitle}>Professional Audiobook Narration</Text>
          </View>
          <View style={s.contractMeta}>
            <Text style={{ fontSize: 8, color: "#666" }}>Contract No: {val(data.contractNumber)}</Text>
            <Text style={{ fontSize: 8, color: "#666", marginTop: 2 }}>Date: {date(data.contractDate)}</Text>
          </View>
        </View>

        <Text style={s.contractTitle}>AUDIOBOOK NARRATION AGREEMENT</Text>
        <Text style={s.contractNum}>{val(data.contractNumber)}</Text>
        <View style={s.divider} />

        {/* Parties */}
        <View style={s.twoCol}>
          <View style={s.col}>
            <Text style={s.sectionHead}>Author / Publisher</Text>
            <Field label="Name" value={data.authorName} />
            <Field label="Company / Publisher" value={data.companyName} />
            <Field label="Email" value={data.authorEmail} />
            <Field label="Phone" value={data.authorPhone} />
            <Field label="Address" value={data.authorAddress} />
          </View>
          <View style={s.col}>
            <Text style={s.sectionHead}>Narrator</Text>
            <Field label="Name" value="Dean Miller" />
            <Field label="Company" value="Dean Miller Narration LLC" />
            <Field label="Website" value="dmnarration.com" />
          </View>
        </View>

        {/* Project */}
        <Text style={s.sectionHead}>Project Details</Text>
        <View style={s.twoCol}>
          <View style={s.col}>
            <Field label="Book Title" value={data.bookTitle} />
            <Field label="Genre" value={data.genre} />
            <Field label="Narration Style" value={data.narrationStyle} />
          </View>
          <View style={s.col}>
            <Field label="Est. Word Count" value={data.wordCount ? `${Number(data.wordCount).toLocaleString()} words` : ""} />
            <Field label="Est. Finished Hours" value={data.finishedHours ? `${data.finishedHours} hrs` : ""} />
          </View>
        </View>

        {/* Rate */}
        <Text style={s.sectionHead}>Rate & Payment</Text>
        <View style={s.twoCol}>
          <View style={s.col}>
            <Field label="Rate Type" value={data.rateType} />
            <Field label="Rate Amount" value={data.rateAmount ? `$${data.rateAmount}` : ""} />
          </View>
          <View style={s.col}>
            <Field label="Payment Schedule" value={data.paymentSchedule} />
          </View>
        </View>
        {data.paymentTiming && <Text style={[s.para, { marginTop: 4 }]}>{data.paymentTiming}</Text>}

        {/* Delivery */}
        <Text style={s.sectionHead}>Delivery</Text>
        <View style={s.twoCol}>
          <View style={s.col}>
            <Field label="Recording Start" value={date(data.recordingStart)} />
          </View>
          <View style={s.col}>
            <Field label="Delivery Deadline" value={date(data.deliveryDeadline)} />
          </View>
        </View>

        {/* Pronunciation Guide */}
        <Text style={s.sectionHead}>Pronunciation Guide</Text>
        <Field
          label="Guide Received"
          value={data.pronunciationReceived
            ? `Yes${data.pronunciationDate ? ` — received ${date(data.pronunciationDate)}` : ""}`
            : "No"}
        />

        {/* Pickups */}
        <Text style={s.sectionHead}>Included Pickups</Text>
        <Text style={s.para}>{pickupText}</Text>

        {/* Additional Pickup Rate */}
        <Text style={s.sectionHead}>Additional Pickup Rates</Text>
        <View style={s.twoCol}>
          <View style={s.col}>
            <Field label="Per Finished Minute" value={data.pickupRatePerMinute ? `$${data.pickupRatePerMinute}` : ""} />
          </View>
          <View style={s.col}>
            <Field label="Per Studio Hour" value={data.pickupRatePerHour ? `$${data.pickupRatePerHour}` : ""} />
          </View>
        </View>

        {/* Rights */}
        <Text style={s.sectionHead}>Rights Granted</Text>
        <Text style={s.para}>{val(data.rightsGranted)}</Text>

        {/* Revision */}
        <Text style={s.sectionHead}>Revision Policy</Text>
        <Text style={s.para}>{val(data.revisionPolicy)}</Text>

        {/* AI Protection */}
        <Text style={s.sectionHead}>AI & Voice Protection</Text>
        <Text style={s.para}>{val(data.aiProtection)}</Text>

        {/* Credit */}
        <Text style={s.sectionHead}>Credit</Text>
        <Text style={s.para}>{val(data.creditLanguage)}</Text>

        {/* Marketing */}
        <Text style={s.sectionHead}>Marketing Permissions</Text>
        <Text style={s.para}>{val(data.marketingPermissions)}</Text>

        {/* Cancellation */}
        <Text style={s.sectionHead}>Cancellation Terms</Text>
        <Text style={s.para}>{val(data.cancellationTerms)}</Text>

        {/* Signatures */}
        <View style={s.divider} />
        <Text style={[s.sectionHead, { marginTop: 4 }]}>Signatures</Text>
        <View style={s.sigSection}>
          <View style={s.sigCol}>
            <Text style={s.sigLabel}>Author / Publisher</Text>
            <View style={s.sigLine} />
            <Text style={s.sigSub}>Signature</Text>
            <Text style={[s.sigSub, { marginTop: 6 }]}>
              Printed Name: {val(data.authorSignatureName, "________________________")}
            </Text>
            <Text style={[s.sigSub, { marginTop: 4 }]}>
              Date: {data.authorSignatureDate ? date(data.authorSignatureDate) : "________________________"}
            </Text>
          </View>
          <View style={s.sigCol}>
            <Text style={s.sigLabel}>Narrator</Text>
            <View style={s.sigLine} />
            <Text style={s.sigSub}>Signature</Text>
            <Text style={[s.sigSub, { marginTop: 6 }]}>
              Printed Name: Dean Miller, Dean Miller Narration LLC
            </Text>
            <Text style={[s.sigSub, { marginTop: 4 }]}>
              Date: {data.narratorSignatureDate ? date(data.narratorSignatureDate) : "________________________"}
            </Text>
          </View>
        </View>

        <Text style={s.footer}>
          This agreement is binding upon signature by both parties.{"\n"}
          Dean Miller Narration LLC  ·  dmnarration.com
        </Text>
        <Text style={s.pageNum} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} fixed />
      </Page>
    </Document>
  );
}
