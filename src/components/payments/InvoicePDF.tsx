import { Document, Page, Text, View, StyleSheet, Link, Image } from "@react-pdf/renderer";
import { dateOnlyToPacificNoon, formatFullDate } from "@/lib/timezone";
import { BUSINESS, ROLE_LABEL, LOGO_URL, payOptions } from "@/lib/business-identity";
import { PDF_BRAND as C } from "@/lib/pdf-brand";

// Carries the brand onto paper: navy and gold spent on structure rather than
// as a background wash, since a client prints this or reads it on a phone.
// Shares its palette with ContractPDF so a client who has already signed
// recognises the invoice as coming from the same business.

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
  /** Stripe Payment Link for this invoice, when one has been raised. */
  cardLink?: string;
  /** The card total once the processing fee is carried by the payer, not you. */
  cardTotal?: number;
  cardFee?: number;
  /** PayPal-hosted invoice link, when one has been raised. */
  paypalLink?: string;
};

const s = StyleSheet.create({
  page:       { fontFamily: "Helvetica", fontSize: 9.5, color: C.body, paddingTop: 46, paddingBottom: 58, paddingHorizontal: 54, lineHeight: 1.45 },

  // header
  headerRow:  { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  brand:      { flexDirection: "row", alignItems: "center", gap: 11 },
  logo:       { width: 44, height: 44, borderRadius: 22 },
  co:         { fontFamily: "Helvetica-Bold", fontSize: 15, color: C.ink, letterSpacing: 0.2 },
  coRole:     { fontFamily: "Helvetica-Bold", fontSize: 6.5, color: C.goldDeep, letterSpacing: 1.6, textTransform: "uppercase", marginTop: 3 },
  coContact:  { fontSize: 8, color: C.muted, marginTop: 6 },
  docType:    { fontFamily: "Helvetica-Bold", fontSize: 20, color: C.gold, letterSpacing: 3, textTransform: "uppercase", textAlign: "right" },
  docNum:     { fontFamily: "Helvetica-Bold", fontSize: 9, color: C.ink, textAlign: "right", marginTop: 3 },
  // The one heavy rule on the page. Everything else is a hairline, so this
  // reads as the masthead rather than as another divider.
  rule:       { borderBottom: `2pt solid ${C.gold}`, marginTop: 12, marginBottom: 16 },

  // bill-to / meta
  twoCol:     { flexDirection: "row", marginBottom: 18 },
  col:        { flex: 1, paddingRight: 16 },
  blockHead:  { fontFamily: "Helvetica-Bold", fontSize: 6.5, color: C.goldDeep, letterSpacing: 1.4, textTransform: "uppercase", marginBottom: 5 },
  nameLine:   { fontFamily: "Helvetica-Bold", fontSize: 10.5, color: C.ink },
  blockLine:  { fontSize: 9, color: C.body, marginTop: 2 },
  metaRow:    { flexDirection: "row", marginBottom: 3 },
  metaLabel:  { fontSize: 8.5, width: 62, color: C.muted, flexShrink: 0 },
  metaValue:  { flex: 1, fontSize: 8.5, color: C.ink },

  // line items
  tHead:      { flexDirection: "row", borderBottom: `0.5pt solid ${C.rule}`, paddingBottom: 5, marginBottom: 9 },
  tHeadCell:  { fontFamily: "Helvetica-Bold", fontSize: 6.5, color: C.goldDeep, letterSpacing: 1.4, textTransform: "uppercase" },
  tRow:       { flexDirection: "row", paddingBottom: 9, marginBottom: 9, borderBottom: `0.5pt solid ${C.ruleFaint}` },
  tDesc:      { flex: 1, paddingRight: 12 },
  tDescText:  { fontSize: 10, color: C.ink },
  tDetail:    { fontSize: 8, color: C.muted, marginTop: 2 },
  tAmt:       { width: 86, textAlign: "right", fontSize: 10, color: C.ink },

  // totals
  totalsWrap: { alignItems: "flex-end", marginTop: 2 },
  totalRow:   { flexDirection: "row", width: 250, justifyContent: "space-between", marginBottom: 4 },
  totalLabel: { fontSize: 9, color: C.muted },
  totalValue: { fontSize: 9, color: C.body },
  // The figure the reader is looking for, so it gets the only filled panel.
  dueBox:     { flexDirection: "row", width: 250, justifyContent: "space-between", alignItems: "center", backgroundColor: C.wash, borderLeft: `2.5pt solid ${C.gold}`, padding: "8pt 12pt", marginTop: 6 },
  dueLabel:   { fontFamily: "Helvetica-Bold", fontSize: 7, color: C.goldDeep, letterSpacing: 1.2, textTransform: "uppercase" },
  dueValue:   { fontFamily: "Helvetica-Bold", fontSize: 15, color: C.ink },

  // how to pay
  payBox:     { backgroundColor: C.wash, borderLeft: `2.5pt solid ${C.gold}`, padding: "11pt 14pt", marginTop: 22 },
  payButton:  { backgroundColor: C.ink, color: "#ffffff", fontFamily: "Helvetica-Bold", fontSize: 9.5, textDecoration: "none", padding: "8pt 16pt", borderRadius: 3, textAlign: "center" },
  payRow:     { marginTop: 8 },
  payNote:    { fontSize: 7.5, color: C.muted, marginTop: 4 },

  notes:      { fontSize: 8.5, color: C.muted, marginTop: 16, lineHeight: 1.55 },
  footer:     { position: "absolute", bottom: 24, left: 54, right: 54, textAlign: "center", fontSize: 7, color: C.faint, letterSpacing: 0.3, borderTop: `0.5pt solid ${C.ruleFaint}`, paddingTop: 6 },
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
  const memo = data.invoiceNumber ? `Invoice ${data.invoiceNumber} — ${data.bookTitle}` : data.bookTitle;
  const options = payOptions(Math.max(0, balance), memo, { card: data.cardLink, paypal: data.paypalLink, cardTotal: data.cardTotal });

  return (
    <Document title={`Invoice ${data.invoiceNumber} — ${data.bookTitle}`} author={BUSINESS.company}>
      <Page size="LETTER" style={s.page}>
        <View style={s.headerRow}>
          <View style={s.brand}>
            {/* The mark is already navy and gold, so it sits in the masthead
                without a container — the page palette was drawn from it. */}
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt prop */}
            <Image src={LOGO_URL} style={s.logo} />
            <View>
              <Text style={s.co}>{BUSINESS.company}</Text>
              <Text style={s.coRole}>{ROLE_LABEL}</Text>
              <Text style={s.coContact}>{BUSINESS.email} · {BUSINESS.site}</Text>
            </View>
          </View>
          <View>
            <Text style={s.docType}>Invoice</Text>
            {data.invoiceNumber ? <Text style={s.docNum}>{data.invoiceNumber}</Text> : null}
          </View>
        </View>

        <View style={s.rule} />

        <View style={s.twoCol}>
          <View style={s.col}>
            <Text style={s.blockHead}>Billed to</Text>
            <Text style={s.nameLine}>{data.billToName || "—"}</Text>
            {data.billToEmail ? <Text style={s.blockLine}>{data.billToEmail}</Text> : null}
            {data.billToLocation ? <Text style={s.blockLine}>{data.billToLocation}</Text> : null}
          </View>
          <View style={s.col}>
            <Text style={s.blockHead}>Project</Text>
            <Text style={s.nameLine}>{data.bookTitle}</Text>
          </View>
          <View style={{ width: 150 }}>
            <Text style={s.blockHead}>Details</Text>
            <MetaRow label="Issued" value={fmtDate(data.invoiceDate)} />
            <MetaRow label="Due" value={fmtDate(data.dueDate)} />
          </View>
        </View>

        <View style={s.tHead}>
          <Text style={[s.tHeadCell, s.tDesc]}>Description</Text>
          <Text style={[s.tHeadCell, s.tAmt]}>Amount</Text>
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
          {data.amountPaid > 0 && (
            <>
              <View style={s.totalRow}>
                <Text style={s.totalLabel}>Subtotal</Text>
                <Text style={s.totalValue}>{money(subtotal)}</Text>
              </View>
              <View style={s.totalRow}>
                <Text style={s.totalLabel}>Paid{data.method ? ` — ${data.method}` : ""}</Text>
                <Text style={s.totalValue}>− {money(data.amountPaid)}</Text>
              </View>
            </>
          )}
          <View style={s.dueBox}>
            <Text style={s.dueLabel}>{settled ? "Paid in full" : "Amount due"}</Text>
            <Text style={s.dueValue}>{money(Math.max(0, balance))}</Text>
          </View>
        </View>

        {!settled && (
          <View style={s.payBox} wrap={false}>
            <Text style={s.blockHead}>How to pay</Text>

            {/* Free methods first. A payer stops at the first one they can use,
                so ordering decides what most of them pick — and the card option
                is the only one that costs anything. */}
            {/* Every method is the same shape and carries its own amount, so
                the choice reads as a choice rather than as one real button
                beside some fine print. Cheapest first: a payer takes the first
                option they recognise, and only the last costs anything. */}
            {options.map(o => (
              <View key={o.url} style={s.payRow}>
                {/* Provider colours: a payer recognises the button before
                    reading it, and the card option wears the brand gold since
                    "card" is nobody's brand. */}
                <Link src={o.url} style={[s.payButton, { backgroundColor: o.bg, color: o.fg }]}>
                  {o.label} — {money(o.amount)}
                </Link>
                {o.note ? <Text style={s.payNote}>{o.note}</Text> : null}
              </View>
            ))}
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
