import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { Resend } from "resend";
import { cookies } from "next/headers";

const resend = new Resend(process.env.RESEND_API_KEY);
const COOKIE = "dmn_admin_key";

export async function POST(req: Request) {
  const c = await cookies();
  if (!c.get(COOKIE)?.value)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { cardId, customMessage } = await req.json();
  if (!cardId) return NextResponse.json({ error: "cardId required" }, { status: 400 });

  const { data: card } = await supabaseAdmin
    .from("board_cards")
    .select("title, author, author_token, author_email")
    .eq("id", cardId)
    .single();

  if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 });
  if (!card.author_email)
    return NextResponse.json({ error: "No author email on file for this card." }, { status: 400 });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.dmnarration.com";
  const tokenUrl = `${siteUrl}/board/${card.author_token}`;
  const from = process.env.RESEND_FROM_EMAIL || "Dean Miller <dean@dmnarration.com>";

  const { error } = await resend.emails.send({
    from,
    to: card.author_email,
    subject: `Production update: ${card.title}`,
    html: `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#06082E;font-family:Georgia,serif;color:#fff;">
  <div style="max-width:580px;margin:0 auto;padding:40px 32px;">
    <p style="color:#D4AF37;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;margin:0 0 28px;">Dean Miller Narration</p>
    <h1 style="font-size:22px;font-weight:700;margin:0 0 6px;line-height:1.3;">${card.title}</h1>
    <p style="color:rgba(255,255,255,0.5);margin:0 0 28px;">Hi ${card.author},</p>
    ${customMessage
      ? `<p style="line-height:1.7;margin:0 0 28px;color:rgba(255,255,255,0.85);">${customMessage.replace(/\n/g, "<br>")}</p>`
      : ""}
    <p style="line-height:1.7;margin:0 0 20px;color:rgba(255,255,255,0.7);">
      You can track your book's production progress at any time using the link below.
    </p>
    <a href="${tokenUrl}"
       style="display:inline-block;background:#D4AF37;color:#000;font-weight:700;font-size:14px;
              padding:13px 28px;border-radius:50px;text-decoration:none;margin-bottom:32px;">
      View your project →
    </a>
    <hr style="border:none;border-top:1px solid rgba(255,255,255,0.08);margin:0 0 24px;">
    <p style="color:rgba(255,255,255,0.3);font-size:11px;margin:0 0 6px;">
      This is a private link for your project. Please keep it confidential.
    </p>
    <p style="color:rgba(255,255,255,0.3);font-size:11px;margin:0;">
      — Dean Miller &nbsp;|&nbsp;
      <a href="${siteUrl}" style="color:#D4AF37;text-decoration:none;">dmnarration.com</a>
    </p>
  </div>
</body>
</html>`,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
