"use client";

import { PDFViewer } from "@react-pdf/renderer";
import { ContractPDF, ContractData } from "./ContractPDF";

export default function ContractPreview({ data }: { data: ContractData }) {
  return (
    <PDFViewer width="100%" height="100%" style={{ border: "none" }}>
      <ContractPDF data={data} />
    </PDFViewer>
  );
}
