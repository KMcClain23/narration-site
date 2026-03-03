"use server";

import { Resend } from "resend";
import { z } from "zod";

const resend = new Resend(process.env.RESEND_API_KEY);

// Assets from your Cloudflare R2 bucket
const LOGO_URL = "https://pub-0274e76b677f47ea8135396e59f3ef10.r2.dev/DeanMillerLogo.png";
const HEADSHOT_URL = "https://pub-0274e76b677f47ea8135396e59f3ef10.r2.dev/Profile.jpg";

const contactSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  message: z.string().min(10),
});

// --- HTML TEMPLATE: INTERNAL INQUIRY (For Dean) ---
const internalTemplate = (name: string, email: string, message: string) => `
  <div style="background-color: #050814; padding: 40px 20px; font-family: sans-serif;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #0B1224; border: 1px solid #1A2550; border-radius: 16px; overflow: hidden;">
      <div style="padding: 30px; border-bottom: 1px solid #1A2550; text-align: center; background-color: #050814;">
        <img src="${LOGO_URL}" alt="Dean Miller Logo" style="height: 40px; width: auto; display: block; margin: 0 auto 15px auto;">
        <h1 style="color: #D4AF37; margin: 0; font-size: 14px; text-transform: uppercase; letter-spacing: 3px; font-weight: normal;">New Project Inquiry</h1>
      </div>
      <div style="padding: 30px; color: #ffffff;">
        <p style="color: #D4AF37; font-size: 11px; font-weight: bold; text-transform: uppercase; margin-bottom: 4px; letter-spacing: 1px;">From</p>
        <p style="margin-top: 0; margin-bottom: 24px; font-size: 16px;">${name} (<a href="mailto:${email}" style="color: #ffffff; text-decoration: none;">${email}</a>)</p>
        <p style="color: #D4AF37; font-size: 11px; font-weight: bold; text-transform: uppercase; margin-bottom: 4px; letter-spacing: 1px;">Project Details</p>
        <div style="background: #050814; padding: 20px; border-radius: 8px; border: 1px solid #1A2550; line-height: 1.6; white-space: pre-wrap; color: rgba(255,255,255,0.9); font-size: 15px;">${message}</div>
        <div style="text-align: center; margin-top: 30px;">
          <a href="mailto:${email}" style="display: inline-block; padding: 12px 28px; background-color: #D4AF37; color: #000000; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 15px;">Reply to Client</a>
        </div>
      </div>
    </div>
  </div>
`;

// --- HTML TEMPLATE: AUTO-REPLY (For the Client) ---
const clientTemplate = (name: string) => `
  <div style="background-color: #050814; padding: 40px 20px; font-family: sans-serif;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #0B1224; border: 1px solid #1A2550; border-radius: 16px; overflow: hidden;">
      <div style="padding: 40px; color: #ffffff; text-align: center;">
        <img src="${LOGO_URL}" alt="Dean Miller Logo" style="height: 50px; width: auto; display: block; margin: 0 auto 25px auto;">
        <h2 style="color: #D4AF37; margin-bottom: 20px; font-size: 22px; letter-spacing: 1px;">Inquiry Received</h2>
        <p style="font-size: 16px; line-height: 1.6; color: rgba(255,255,255,0.95);">Hi ${name},</p>
        <p style="font-size: 16px; line-height: 1.6; color: rgba(255,255,255,0.9); margin-bottom: 30px;">Thanks for reaching out! I've received your project details and will review them shortly. You can typically expect a response within 24-48 hours.</p>
        <div style="max-width: 200px; margin: 30px auto; border-top: 1px solid #1A2550;"></div>
        
        <table role="presentation" style="margin: 0 auto; text-align: left;">
          <tr>
            <td style="padding-right: 15px;">
              <img src="${HEADSHOT_URL}" alt="Dean Miller" style="width: 60px; height: 60px; border-radius: 50%; border: 2px solid #D4AF37; object-fit: cover;">
            </td>
            <td>
              <p style="font-size: 18px; font-weight: bold; margin: 0; color: #ffffff;">Dean Miller</p>
              <p style="font-size: 12px; color: #D4AF37; margin: 2px 0 0 0; text-transform: uppercase; letter-spacing: 1px;">Audiobook Narrator</p>
            </td>
          </tr>
        </table>
      </div>
    </div>
  </div>
`;

export async function sendEmail(formData: FormData) {
  const honeypot = formData.get("_hp_name");
  if (honeypot) return { success: true };

  const validatedFields = contactSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    message: formData.get("message"),
  });

  if (!validatedFields.success) {
    return { 
      success: false, 
      error: "Please check your input. Name, valid email, and a message of at least 10 characters are required." 
    };
  }

  const { name, email, message } = validatedFields.data;

  try {
    await Promise.all([
      resend.emails.send({
        from: "Dean Miller Narration <Dean@dmnarration.com>",
        to: ["Dean@DMNarration.com"],
        subject: `New Project Inquiry: ${name}`,
        replyTo: email,
        html: internalTemplate(name, email, message),
      }),
      resend.emails.send({
        from: "Dean Miller Narration <Dean@dmnarration.com>",
        to: [email],
        subject: "Inquiry Received - Dean Miller Narration",
        html: clientTemplate(name),
      })
    ]);

    return { success: true };
  } catch (err) {
    console.error("Email service error:", err);
    return { 
      success: false, 
      error: "The email service is temporarily unavailable. Please try again later or email me directly." 
    };
  }
}