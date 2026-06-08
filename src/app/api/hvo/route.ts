import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const authorName = (formData.get("author_name") as string | null)?.trim();
    const email = (formData.get("email") as string | null)?.trim();
    const bookTitle = (formData.get("book_title") as string | null)?.trim();
    const comments = (formData.get("comments") as string | null)?.trim();
    const file = formData.get("snippet") as File | null;

    if (!authorName || !email || !bookTitle) {
      return NextResponse.json({ error: "Required fields missing" }, { status: 400 });
    }

    const from = process.env.RESEND_FROM_EMAIL || "Dean Miller <dean@dmnarration.com>";

    const attachments: { filename: string; content: Buffer }[] = [];
    if (file && file.size > 0) {
      const buffer = Buffer.from(await file.arrayBuffer());
      attachments.push({ filename: file.name, content: buffer });
    }

    const { error } = await resend.emails.send({
      from,
      to: "deanmillernarrator@gmail.com",
      replyTo: email,
      subject: `HVO Submission: ${bookTitle} — ${authorName}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
          <h2 style="margin:0 0 20px;">HVO Submission</h2>
          <table style="border-collapse:collapse;width:100%;">
            <tr><td style="padding:8px 12px;font-weight:600;width:140px;">Author Name</td><td style="padding:8px 12px;">${authorName}</td></tr>
            <tr><td style="padding:8px 12px;font-weight:600;">Email</td><td style="padding:8px 12px;"><a href="mailto:${email}">${email}</a></td></tr>
            <tr><td style="padding:8px 12px;font-weight:600;">Book Title</td><td style="padding:8px 12px;">${bookTitle}</td></tr>
            <tr><td style="padding:8px 12px;font-weight:600;">Snippet</td><td style="padding:8px 12px;">${file && file.size > 0 ? `${file.name} (attached)` : "None provided"}</td></tr>
            ${comments ? `<tr><td style="padding:8px 12px;font-weight:600;vertical-align:top;">Comments</td><td style="padding:8px 12px;white-space:pre-wrap;">${comments}</td></tr>` : ""}
          </table>
        </div>
      `,
      attachments,
    });

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("HVO submission error:", err);
    return NextResponse.json({ error: "Failed to send submission" }, { status: 500 });
  }
}
