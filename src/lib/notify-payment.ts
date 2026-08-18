import "server-only";
import { Resend } from "resend";
import { BUSINESS, LOGO_URL } from "@/lib/business-identity";
import { PDF_BRAND as C } from "@/lib/pdf-brand";

/**
 * Tell the narrator that an invoice was paid.
 *
 * The webhooks settled payments in complete silence: the money landed, the
 * links closed, the row updated, and nothing said so. A provider's own receipt
 * arrives eventually but names a customer and an amount, not a book, so
 * matching it to a project meant opening the app and hunting.
 *
 * Never throws. A webhook that fails after the payment is recorded gets
 * retried by the provider, and a retry that re-settles a payment is a worse
 * outcome than a missed email.
 */

const esc = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

/** Someone still to be paid out of this project, and the ways to pay them. */
export type OwedPayee = {
  name: string;
  amount: number;
  /** Prefilled Venmo link, when a handle is on file for them. */
  venmoUrl: string;
  email: string;
};

export type PaymentNotice = {
  /** Money recorded against this narrator's share, which is what lands. */
  amount: number;
  method: string;
  projectTitle: string;
  author: string;
  invoiceNumber: string;
  /**
   * Who is still owed out of this project, named rather than totalled.
   *
   * "Others" was the wrong word for two people with names, rates and handles
   * already on file, and the moment the money lands is the moment to pay them.
   */
  owed: OwedPayee[];
};

function row(label: string, value: string): string {
  return `<tr>
    <td style="padding:4px 12px 4px 0;font-size:13px;color:${C.muted};white-space:nowrap;">${esc(label)}</td>
    <td style="padding:4px 0;font-size:14px;color:${C.body};">${esc(value)}</td>
  </tr>`;
}

export function paymentNoticeSubject(notice: PaymentNotice): string {
  const who = notice.author.trim() || "A client";
  return `${who} paid ${usd(notice.amount)} for ${notice.projectTitle}`;
}

/** Exported so the mail can be rendered and read without sending anything. */
export function paymentNoticeHtml(notice: PaymentNotice): string {
  const details = [
    row("Project", notice.projectTitle),
    notice.author.trim() ? row("Author", notice.author.trim()) : "",
    row("Paid by", notice.method),
    notice.invoiceNumber.trim() ? row("Invoice", notice.invoiceNumber.trim()) : "",
  ].join("");

  // Said here because this is the moment the number is most likely to be
  // misread: what arrived is not what is kept when an editor is still owed out
  // of it. Each name carries its own way to pay, so acting on it does not mean
  // going and finding a handle first.
  const payable = notice.owed.filter(p => p.amount > 0.005);
  const owedTotal = payable.reduce((s, p) => s + p.amount, 0);

  const owed = payable.length
    ? `<div style="margin:18px 0 0;padding-top:14px;border-top:1px solid ${C.ruleFaint};">
         <p style="margin:0 0 8px;font-size:13px;color:${C.muted};">
           ${usd(owedTotal)} of this still goes out:
         </p>
         ${payable
           .map(p => {
             const links = [
               p.venmoUrl
                 ? `<a href="${esc(p.venmoUrl)}" style="color:${C.goldDeep};text-decoration:none;font-weight:600;">Pay on Venmo</a>`
                 : "",
               p.email
                 ? `<a href="mailto:${esc(p.email)}" style="color:${C.muted};text-decoration:none;">Email</a>`
                 : "",
             ]
               .filter(Boolean)
               .join(`<span style="color:${C.faint};"> · </span>`);
             return `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:6px;">
               <tr>
                 <td style="font-size:14px;color:${C.body};">${esc(p.name)}</td>
                 <td align="right" style="font-size:14px;color:${C.body};white-space:nowrap;">${usd(p.amount)}</td>
               </tr>
               ${links ? `<tr><td colspan="2" style="font-size:13px;padding-top:1px;">${links}</td></tr>` : ""}
             </table>`;
           })
           .join("")}
       </div>`
    : "";

  return `
    <div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:8px;">
      <img src="${LOGO_URL}" alt="${esc(BUSINESS.name)}" width="140" style="display:block;margin-bottom:20px;" />
      <div style="border:1px solid ${C.rule};border-radius:10px;padding:20px;">
        <p style="margin:0;font-size:13px;color:${C.muted};letter-spacing:0.06em;text-transform:uppercase;">Payment received</p>
        <p style="margin:6px 0 18px;font-size:30px;font-weight:700;color:${C.goldDeep};">${usd(notice.amount)}</p>
        <table cellpadding="0" cellspacing="0" border="0">${details}</table>
        ${owed}
      </div>
      <p style="margin:18px 0 0;font-size:12px;color:${C.muted};">
        Recorded automatically. Nothing to do unless the figure looks wrong.
      </p>
    </div>`;
}

export async function notifyPaymentReceived(notice: PaymentNotice): Promise<void> {
  try {
    if (!process.env.RESEND_API_KEY) return;
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || `${BUSINESS.name} <${BUSINESS.email}>`,
      to: BUSINESS.email,
      subject: paymentNoticeSubject(notice),
      html: paymentNoticeHtml(notice),
    });
  } catch (err) {
    // Logged, not raised: see the note at the top of this file.
    console.error("payment notification failed:", err);
  }
}
