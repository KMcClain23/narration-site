"use server";

import { Resend } from "resend";
import { z } from "zod";

const resend = new Resend(process.env.RESEND_API_KEY);

// Assets and Links
const LOGO_URL = "https://pub-0274e76b677f47ea8135396e59f3ef10.r2.dev/DeanMillerLogo.png";
const HEADSHOT_URL = "https://pub-0274e76b677f47ea8135396e59f3ef10.r2.dev/Profile.jpg";
const BANNER_URL = "https://pub-0274e76b677f47ea8135396e59f3ef10.r2.dev/DeanMillerBanner.png";
const BOOKINGS_URL = "https://outlook.office.com/book/DeanMillerNarration1@deanmillernarrator.com/s/-Gzrs2xlgUy8MfSGaPUf1A2?ismsaljsauthenabled";
const SITE_URL = "https://dmnarration.com"; // Replace with your actual live domain

const contactSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  message: z.string().min(10),
});

// --- HTML TEMPLATE: INTERNAL INQUIRY (For Dean) ---
const internalTemplate = (name: string, email: string, message: string) => `
  <div style="background-color: #050814; padding: 40px 20px; font-family: sans-serif;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #0B1224; border: 1px solid #1A2550; border-radius: 16px; overflow: hidden;">
      
      <div style="width: 100%; height: 150px; overflow: hidden; background-color: #050814;">
        <img src="${BANNER_URL}" alt="Dean Miller Banner" style="width: 100%; height: 100%; object-fit: cover; opacity: 0.8;">
      </div>

      <div style="padding: 25px; border-bottom: 1px solid #1A2550; text-align: center; margin-top: -40px;">
        <img src="${LOGO_URL}" alt="Dean Miller Logo" style="height: 35px; width: auto; display: block; margin: 0 auto 10px auto; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.5));">
        <h1 style="color: #D4AF37; margin: 0; font-size: 13px; text-transform: uppercase; letter-spacing: 3px; font-weight: normal;">New Production Brief</h1>
      </div>

      <div style="padding: 30px; color: #ffffff;">
        <p style="color: #D4AF37; font-size: 11px; font-weight: bold; text-transform: uppercase; margin-bottom: 4px; letter-spacing: 1px;">Client</p>
        <p style="margin-top: 0; margin-bottom: 24px; font-size: 16px;">${name} (<a href="mailto:${email}" style="color: #ffffff; text-decoration: none;">${email}</a>)</p>
        
        <p style="color: #D4AF37; font-size: 11px; font-weight: bold; text-transform: uppercase; margin-bottom: 4px; letter-spacing: 1px;">Project Details</p>
        <div style="background: #050814; padding: 20px; border-radius: 8px; border: 1px solid #1A2550; line-height: 1.6; white-space: pre-wrap; color: rgba(255,255,255,0.9); font-size: 15px;">${message}</div>
        
        <div style="text-align: center; margin-top: 30px;">
          <a href="mailto:${email}" style="display: inline-block; padding: 12px 28px; background-color: #D4AF37; color: #000000; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px;">Review & Reply</a>
        </div>
      </div>
    </div>
  </div>
`;

// --- HTML TEMPLATE: AUTO-REPLY (For the Client) ---
const clientTemplate = (name: string) => `
  <div style="background-color: #050814; padding: 40px 20px; font-family: sans-serif;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #0B1224; border: 1px solid #1A2550; border-radius: 16px; overflow: hidden;">
      
      <div style="width: 100%; height: 180px; overflow: hidden; background-color: #050814;">
        <img src="${BANNER_URL}" alt="Dean Miller Narration" style="width: 100%; height: 100%; object-fit: cover;">
      </div>

      <div style="padding: 40px; color: #ffffff; text-align: center;">
        <img src="${LOGO_URL}" alt="Dean Miller Logo" style="height: 45px; width: auto; display: block; margin: 0 auto 20px auto;">
        
        <h2 style="color: #D4AF37; margin-bottom: 20px; font-size: 22px; letter-spacing: 1px; font-weight: bold;">Inquiry Received</h2>
        
        <p style="font-size: 16px; line-height: 1.6; color: rgba(255,255,255,0.95);">Hi ${name},</p>
        <p style="font-size: 16px; line-height: 1.6; color: rgba(255,255,255,0.9); margin-bottom: 25px;">Thanks for reaching out! I've received your project details and will review them shortly. You can typically expect a response within 24–48 hours.</p>

        <div style="margin-bottom: 35px;">
          <a href="${SITE_URL}/#demos" style="display: inline-block; padding: 10px 20px; margin: 5px; border: 1px solid #D4AF37; color: #D4AF37; text-decoration: none; border-radius: 4px; font-size: 13px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">Listen to Demos</a>
          <a href="${BOOKINGS_URL}" style="display: inline-block; padding: 10px 20px; margin: 5px; background-color: #D4AF37; color: #000000; text-decoration: none; border-radius: 4px; font-size: 13px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">Book a 15-min Call</a>
        </div>
        
        <div style="max-width: 250px; margin: 30px auto; border-top: 1px solid #1A2550;"></div>
        
        <table role="presentation" style="margin: 0 auto; text-align: left; border-collapse: collapse;">
          <tr>
            <td style="padding-right: 15px; vertical-align: middle;">
              <img src="${HEADSHOT_URL}" alt="Dean Miller" style="width: 64px; height: 64px; border-radius: 50%; border: 2px solid #D4AF37; object-fit: cover; display: block;">
            </td>
            <td style="vertical-align: middle;">
              <p style="font-size: 18px; font-weight: bold; margin: 0; color: #ffffff; line-height: 1.2;">Dean Miller</p>
              <p style="font-size: 11px; color: #D4AF37; margin: 4px 0 0 0; text-transform: uppercase; letter-spacing: 2px;">Audiobook Narrator</p>
              <p style="font-size: 11px; color: rgba(255,255,255,0.5); margin: 2px 0 0 0;">Broadcast-Ready Home Studio</p>
            </td>
          </tr>
        </table>
      </div>
    </div>
    <div style="text-align: center; margin-top: 20px;">
        <p style="font-size: 11px; color: rgba(255,255,255,0.3); text-transform: uppercase; letter-spacing: 1px;">© ${new Date().getFullYear()} Dean Miller Narration</p>
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