import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { dateOnlyToPacificNoon, formatFullDate } from "@/lib/timezone";
import { BUSINESS } from "@/lib/business-identity";

// Deliberately mirrors ContractPDF's typography and spacing — a client who has
// already signed a contract should recognize the invoice as coming from the
// same business rather than from a different template.

export type InvoiceLine = {
  description: string;
  detail?: string;
  amount: number;
};

export type InvoiceData = {
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  billToName: string;
  billToEmail: string;
  billToLocation: string;
  bookTitle: string;
  lines: InvoiceLine[];
  /** Already received against this invoice, if any. */
  amountPaid: number;
  method: string;
  notes: string;
};

const s = StyleSheet.create({
  page:       { fontFamily: "Helvetica", fontSize: 9.5, color: "#111", paddingTop: 44, paddingBottom: 56, paddingHorizontal: 54, lineHeight: 1.45 },
  headerRow:  { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 },
  co:         { fontFamily: "Helvetica-Bold", fontSize: 13 },
  coSub:      { fontSize: 8, color: "#666", marginTop: 2 },
  metaRight:  { alignItems: "flex-end" },
  metaText:   { fontSize: 8, color: "#555" },
  hr:         { borderBottom: "1pt solid #bbb", marginVertical: 10 },
  title:      { fontFamily: "Helvetica-Bold", fontSize: 15, marginBottom: 2 },
  titleSub:   { fontSize: 9, color: "#555", marginBottom: 10 },
  // bill-to / meta
  twoCol:     { flexDirection: "row", marginBottom: 14 },
  col:        { flex: 1 },
  blockHead:  { fontFamily: "Helvetica-Bold", fontSize: 7.5, color: "#888", marginBottom: 4, letterSpacing: 0.5 },
  blockLine:  { fontSize: 9, marginBottom: 1.5 },
  metaRow:    { flexDirection: "row", marginBottom: 3 },
  metaLabel:  { fontFamily: "Helvetica-Bold", fontSize: 8, width: 78, color: "#555", flexShrink: 0 },
  metaValue:  { flex: 1, fontSize: 8 },
  // line items
  tHead:      { flexDirection: "row", borderBottom: "0.5pt solid #bbb", paddingBottom: 4, marginBottom: 6 },
  tHeadCell:  { fontFamily: "Helvetica-Bold", fontSize: 7.5, color: "#888", letterSpacing: 0.5 },
  tRow:       { flexDirection: "row", marginBottom: 7 },
  tDesc:      { flex: 1, paddingRight: 12 },
  tDescText:  { fontSize: 9.5 },
  tDetail:    { fontSize: 8, color: "#666", marginTop: 1.5 },
  tAmt:       { width: 82, textAlign: "right", fontSize: 9.5 },
  // totals
  totalsWrap: { marginTop: 6, alignItems: "flex-end" },
  totalRow:   { flexDirection: "row", width: 240, justifyContent: "space-between", marginBottom: 3 },
  totalLabel: { fontSize: 9, color: "#555" },
  totalValue: { fontSize: 9 },
  dueRow:     { flexDirection: "row", width: 240, justifyContent: "space-between", borderTop: "1pt solid #bbb", paddingTop: 5, marginTop: 3 },
  dueLabel:   { fontFamily: "Helvetica-Bold", fontSize: 11 },
  dueValue:   { fontFamily: "Helvetica-Bold", fontSize: 11 },
  // remit / notes
  remitBox:   { backgroundColor: "#f7f7f7", border: "0.5pt solid #ddd", padding: "8pt 12pt", marginTop: 20 },
  notes:      { fontSize: 8.5, color: "#555", marginTop: 12, lineHeight: 1.5 },
  footer:     { position: "absolute", bottom: 22, left: 54, right: 54, textAlign: "center", fontSize: 7.5, color: "#999", borderTop: "0.5pt solid #ddd", paddingTop: 5 },
});

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

const fmtDate = (d: string) => {
  if (!d) return "";
  try {
    return formatFullDate(dateOnlyToPacificNoon(d) ?? d);
  } catch {
    return d;
  }
};

function MetaRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <View style={s.metaRow}>
      <Text style={s.metaLabel}>{label}</Text>
      <Text style={s.metaValue}>{value}</Text>
    </View>
  );
}

export function InvoicePDF({ data }: { data: InvoiceData }) {
  const subtotal = data.lines.reduce((sum, l) => sum + l.amount, 0);
  const balance = subtotal - data.amountPaid;
  const settled = balance <= 0.005;

  return (
    <Document title={`Invoice ${data.invoiceNumber} — ${data.bookTitle}`} author={BUSINESS.company}>
      <Page size="LETTER" style={s.page}>
        <View style={s.headerRow}>
          <View>
            <Text style={s.co}>{BUSINESS.company}</Text>
            <Text style={s.coSub}>{BUSINESS.email} · {BUSINESS.site}</Text>
          </View>
          <View style={s.metaRight}>
            <Text style={s.metaText}>{BUSINESS.name}</Text>
          </View>
        </View>

        <View style={s.hr} />

        <Text style={s.title}>Invoice</Text>
        <Text style={s.titleSub}>{data.bookTitle}</Text>

        <View style={s.twoCol}>
          <View style={s.col}>
            <Text style={s.blockHead}>BILL TO</Text>
            <Text style={s.blockLine}>{data.billToName || "—"}</Text>
            {data.billToEmail ? <Text style={s.blockLine}>{data.billToEmail}</Text> : null}
            {data.billToLocation ? <Text style={s.blockLine}>{data.billToLocation}</Text> : null}
          </View>
          <View style={s.col}>
            <Text style={s.blockHead}>DETAILS</Text>
            <MetaRow label="Invoice #" value={data.invoiceNumber} />
            <MetaRow label="Date" value={fmtDate(data.invoiceDate)} />
            <MetaRow label="Due" value={fmtDate(data.dueDate)} />
          </View>
        </View>

        <View style={s.tHead}>
          <Text style={[s.tHeadCell, s.tDesc]}>DESCRIPTION</Text>
          <Text style={[s.tHeadCell, s.tAmt]}>AMOUNT</Text>
        </View>

        {data.lines.map((l, i) => (
          <View key={i} style={s.tRow} wrap={false}>
            <View style={s.tDesc}>
              <Text style={s.tDescText}>{l.description}</Text>
              {l.detail ? <Text style={s.tDetail}>{l.detail}</Text> : null}
            </View>
            <Text style={s.tAmt}>{money(l.amount)}</Text>
          </View>
        ))}

        <View style={s.totalsWrap}>
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Subtotal</Text>
            <Text style={s.totalValue}>{money(subtotal)}</Text>
          </View>
          {data.amountPaid > 0 && (
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>
                Paid{data.method ? ` — ${data.method}` : ""}
              </Text>
              <Text style={s.totalValue}>− {money(data.amountPaid)}</Text>
            </View>
          )}
          <View style={s.dueRow}>
            <Text style={s.dueLabel}>{settled ? "Paid in full" : "Amount due"}</Text>
            <Text style={s.dueValue}>{money(Math.max(0, balance))}</Text>
          </View>
        </View>

        {!settled && (
          <View style={s.remitBox}>
            <Text style={s.blockHead}>REMIT TO</Text>
            <Text style={s.blockLine}>{BUSINESS.company}</Text>
            <Text style={s.blockLine}>{BUSINESS.email}</Text>
          </View>
        )}

        {data.notes ? <Text style={s.notes}>{data.notes}</Text> : null}

        <Text style={s.footer} fixed>
          {BUSINESS.company} · {BUSINESS.email} · {BUSINESS.site}
        </Text>
      </Page>
    </Document>
  );
}
