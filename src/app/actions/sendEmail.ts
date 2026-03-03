"use server";

import { Resend } from "resend";
import { z } from "zod";

const resend = new Resend(process.env.RESEND_API_KEY);

const contactSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  message: z.string().min(10),
});

// --- HTML TEMPLATE: INTERNAL INQUIRY (For Dean) ---
const internalTemplate = (name: string, email: string, message: string) => `
  <div style="background-color: #050814; padding: 40px 20px; font-family: sans-serif;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #0B1224; border: 1px solid #1A2550; border-radius: 16px; overflow: hidden;">
      <div style="padding: 30px; border-bottom: 1px solid #1A2550; text-align: center;">
        <h1 style="color: #D4AF37; margin: 0; font-size: 16px; text-transform: uppercase; letter-spacing: 3px;">New Project Inquiry</h1>
      </div>
      <div style="padding: 30px; color: #ffffff;">
        <p style="color: #D4AF37; font-size: 12px; font-weight: bold; text-transform: uppercase; margin-bottom: 4px;">From</p>
        <p style="margin-top: 0; margin-bottom: 20px; font-size: 16px;">${name} (${email})</p>
        
        <p style="color: #D4AF37; font-size: 12px; font-weight: bold; text-transform: uppercase; margin-bottom: 4px;">Project Details</p>
        <div style="background: #050814; padding: 20px; border-radius: 8px; border: 1px solid #1A2550; line-height: 1.6; white-space: pre-wrap;">${message}</div>
        
        <div style="text-align: center; margin-top: 30px;">
          <a href="mailto:${email}" style="display: inline-block; padding: 12px 24px; background-color: #D4AF37; color: #000000; text-decoration: none; border-radius: 6px; font-weight: bold;">Reply to Client</a>
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
        <h2 style="color: #D4AF37; margin-bottom: 20px;">Inquiry Received</h2>
        <p style="font-size: 16px; line-height: 1.6; color: rgba(255,255,255,0.9);">Hi ${name},</p>
        <p style="font-size: 16px; line-height: 1.6; color: rgba(255,255,255,0.9);">Thanks for reaching out! I've received your project details and will review them shortly. You can typically expect a response within 24-48 hours.</p>
        <div style="margin: 30px 0; border-top: 1px solid #1A2550;"></div>
        <p style="font-size: 14px; color: #D4AF37;">Best,</p>
        <p style="font-size: 18px; font-weight: bold; margin-top: 5px;">Dean Miller</p>
        <p style="font-size: 12px; color: rgba(255,255,255,0.5);">Audiobook Narrator</p>
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
      // 1. Primary Inquiry to Dean
      resend.emails.send({
        from: "Dean Miller Narration <Dean@dmnarration.com>",
        to: ["Dean@DMNarration.com"],
        subject: `New Project Inquiry: ${name}`,
        replyTo: email,
        html: internalTemplate(name, email, message),
      }),
      // 2. Auto-reply confirmation to the client
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