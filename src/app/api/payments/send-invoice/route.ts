import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { requireAdmin } from "@/lib/require-admin";
import { BUSINESS } from "@/lib/business-identity";

export const dynamic = "force-dynamic";

const resend = new Resend(process.env.RESEND_API_KEY);

/** Rejects the obvious mistakes before an email goes anywhere. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const MAX_PDF_BYTES = 8 * 1024 * 1024;

/** Everything interpolated into the mail body passes through here first. */
const esc = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

/**
 * Email an invoice PDF to the client.
 *
 * The PDF arrives from the browser rather than being re-rendered here, so what
 * is sent is byte-for-byte the document that was previewed and edited. Building
 * a second copy server-side would risk emailing something the sender never saw.
 */
export async function POST(req: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: "Email is not configured." }, { status: 500 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Malformed request." }, { status: 400 });

  const to = String(form.get("to") ?? "").trim();
  const subject = String(form.get("subject") ?? "").trim();
  const message = String(form.get("message") ?? "").trim();
  const filename = String(form.get("filename") ?? "invoice.pdf").replace(/[^\w.\-]/g, "_");
  const file = form.get("pdf");

  if (!EMAIL_RE.test(to)) {
    return NextResponse.json({ error: "That doesn't look like an email address." }, { status: 400 });
  }
  if (!subject) {
    return NextResponse.json({ error: "A subject is required." }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "The invoice PDF is missing." }, { status: 400 });
  }
  if (file.size > MAX_PDF_BYTES) {
    return NextResponse.json({ error: "That PDF is too large to email." }, { status: 400 });
  }

  const pdf = Buffer.from(await file.arrayBuffer());

  // Plain text, escaped, with line breaks preserved. The body is typed by the
  // sender, so it is content to be displayed — never markup to be interpreted.
  const body = esc(message)
    .split(/\n{2,}/)
    .map(p => `<p style="margin:0 0 14px;">${p.replace(/\n/g, "<br/>")}</p>`)
    .join("");

  // What the payer needs without opening anything: the amount, and a way to
  // pay it. An attachment-only email makes them download a PDF to find out
  // what they owe, then leave the inbox again to act on it.
  const amountDue = Number(form.get("amount_due"));
  const cardLink = String(form.get("card_link") ?? "").trim();
  const cardTotal = Number(form.get("card_total"));
  const venmo = String(form.get("venmo") ?? "").trim();

  const summary = Number.isFinite(amountDue) && amountDue > 0
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 20px;border:1px solid #e3e3e3;border-radius:8px;">
         <tr><td style="padding:16px 18px;">
           <div style="font-size:12px;letter-spacing:.5px;color:#888;text-transform:uppercase;">Amount due</div>
           <div style="font-size:26px;font-weight:700;color:#111;margin-top:2px;">${esc(usd(amountDue))}</div>
         </td></tr>
       </table>`
    : "";

  // https only. The link comes from this app's own Stripe call, but a mail
  // body is the last place to relax about what a URL scheme can be.
  const payButton = /^https:\/\//.test(cardLink)
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 8px;">
         <tr><td style="background:#111;border-radius:6px;">
           <a href="${esc(cardLink)}" style="display:inline-block;padding:13px 26px;color:#fff;font-size:15px;font-weight:600;text-decoration:none;">
             Pay${Number.isFinite(cardTotal) && cardTotal > 0 ? ` ${esc(usd(cardTotal))}` : ""} by card
           </a>
         </td></tr>
       </table>
       <p style="margin:0 0 20px;font-size:13px;color:#777;">
         Card payments include a processing fee${venmo ? `. Venmo to ${esc(venmo)} avoids it` : ""}.
       </p>`
    : venmo
      ? `<p style="margin:0 0 20px;font-size:14px;color:#444;">Venmo — ${esc(venmo)}</p>`
      : "";

  const html = `${summary}${body}${payButton}`;

  const { data, error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || `${BUSINESS.name} <${BUSINESS.email}>`,
    to,
    replyTo: BUSINESS.email,
    subject,
    html: `<div style="font-family:sans-serif;max-width:600px;font-size:15px;line-height:1.6;color:#111;">${html}</div>`,
    attachments: [{ filename, content: pdf }],
  });

  if (error) {
    return NextResponse.json({ error: error.message || "Could not send the email." }, { status: 502 });
  }

  return NextResponse.json({ sent: true, id: data?.id ?? null });
}
