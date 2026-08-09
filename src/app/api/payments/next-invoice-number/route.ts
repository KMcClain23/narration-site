import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { isAdminRequest } from "@/lib/require-admin";

// Next invoice number, derived from what's already stored rather than from a
// counter in localStorage — which is how the contract builder does it, and
// which silently restarts at 001 on a new browser or a cleared cache, handing
// out duplicates.
//
// Format mirrors the contract scheme (DMN-2026-001) with an INV segment, so
// the two sequences are visibly different documents and can't be confused for
// each other in a filename.

const PREFIX = "DMN-INV";

export async function GET() {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const year = new Date().getFullYear();
  const yearPrefix = `${PREFIX}-${year}-`;

  const { data, error } = await supabaseAdmin
    .from("payments")
    .select("invoice_number")
    .like("invoice_number", `${yearPrefix}%`);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Scanning for the max rather than counting rows: a deleted or manually
  // renumbered invoice must not cause the next one to reuse a number.
  let highest = 0;
  for (const row of data ?? []) {
    const n = parseInt(String(row.invoice_number).slice(yearPrefix.length), 10);
    if (Number.isFinite(n) && n > highest) highest = n;
  }

  return NextResponse.json({
    invoice_number: `${yearPrefix}${String(highest + 1).padStart(3, "0")}`,
  });
}
