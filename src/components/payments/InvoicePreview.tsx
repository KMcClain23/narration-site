"use client";

import { PDFViewer } from "@react-pdf/renderer";
import { InvoicePDF, type InvoiceData } from "./InvoicePDF";

// Same shape as the contract builder's preview: a default export loaded via
// next/dynamic with ssr:false, because PDFViewer touches browser APIs.

export default function InvoicePreview({ data }: { data: InvoiceData }) {
  return (
    <PDFViewer width="100%" height="100%" style={{ border: "none" }}>
      <InvoicePDF data={data} />
    </PDFViewer>
  );
}
