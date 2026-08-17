import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { requireAdmin } from "@/lib/require-admin";
import { BUSINESS, ROLE_LABEL, payOptions } from "@/lib/business-identity";
import { PDF_BRAND as C } from "@/lib/pdf-brand";

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
  const venmo = String(form.get("venmo") ?? "").trim();
  const paypal = String(form.get("paypal") ?? "").trim();

  // Same navy-and-gold as the PDF. An email that looks like a different
  // business from its own attachment reads as a phishing attempt.
  const masthead = `
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 22px;">
      <tr><td style="padding:0 0 12px;border-bottom:2px solid ${C.gold};">
        <div style="font-size:17px;font-weight:700;color:${C.ink};">${esc(BUSINESS.company)}</div>
        <div style="font-size:10px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:${C.goldDeep};margin-top:3px;">${esc(ROLE_LABEL)}</div>
      </td></tr>
    </table>`;

  const summary = Number.isFinite(amountDue) && amountDue > 0
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 22px;background:${C.wash};border-left:4px solid ${C.gold};border-radius:3px;">
         <tr><td style="padding:15px 18px;">
           <div style="font-size:10px;font-weight:700;letter-spacing:1.2px;color:${C.goldDeep};text-transform:uppercase;">Amount due</div>
           <div style="font-size:28px;font-weight:700;color:${C.ink};margin-top:3px;">${esc(usd(amountDue))}</div>
         </td></tr>
       </table>`
    : "";

  // The same options, in the same order, as the attached PDF — built from the
  // same helper so the email and the document can't disagree about what the
  // client owes or how they can send it.
  //
  // https only. These come from this app's own config and Stripe call, but a
  // mail body is the last place to relax about what a URL scheme can be.
  const memo = String(form.get("memo") ?? subject).slice(0, 200);
  const options = payOptions(
    Number.isFinite(amountDue) && amountDue > 0 ? amountDue : 0,
    memo,
    /^https:\/\//.test(cardLink) ? cardLink : undefined,
  ).filter(o => /^https:\/\//.test(o.url));

  const buttons = options
    .map(
      o => `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 10px;">
              <tr><td style="background:${C.ink};border-radius:5px;">
                <a href="${esc(o.url)}" style="display:inline-block;padding:13px 26px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">
                  ${esc(o.label)} — ${esc(usd(o.amount))}
                </a>
              </td></tr>
              ${o.note ? `<tr><td style="padding-top:2px;font-size:12px;color:${C.muted};">${esc(o.note)}</td></tr>` : ""}
            </table>`,
    )
    .join("");

  const fallback = venmo || paypal
    ? `<p style="margin:14px 0 0;font-size:13px;color:${C.muted};">
         ${[venmo ? `Venmo ${esc(venmo)}` : "", paypal ? `PayPal ${esc(paypal)}` : ""].filter(Boolean).join(" · ")}
       </p>`
    : "";

  const html = `${masthead}${summary}${body}${buttons}${fallback}`;

  const { data, error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || `${BUSINESS.name} <${BUSINESS.email}>`,
    to,
    replyTo: BUSINESS.email,
    subject,
    html: `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:580px;margin:0 auto;padding:8px;font-size:15px;line-height:1.6;color:${C.body};">${html}</div>`,
    attachments: [{ filename, content: pdf }],
  });

  if (error) {
    return NextResponse.json({ error: error.message || "Could not send the email." }, { status: 502 });
  }

  return NextResponse.json({ sent: true, id: data?.id ?? null });
}
