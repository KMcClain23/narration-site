"use server";

import { Resend } from "resend";
import { z } from "zod";

// Initialize Resend with your API Key from .env.local
const resend = new Resend(process.env.RESEND_API_KEY);

// Define the validation schema
const contactSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  message: z.string().min(10),
});

export async function sendEmail(formData: FormData) {
  // 1. Honeypot bot protection check
  const honeypot = formData.get("_hp_name");
  if (honeypot) return { success: true };

  // 2. Validate form fields
  const validatedFields = contactSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    message: formData.get("message"),
  });

  // 3. Handle validation errors (Returns a simple string to satisfy HomeClient TS requirements)
  if (!validatedFields.success) {
    return { 
      success: false, 
      error: "Please check your input. Name, valid email, and a message of at least 10 characters are required." 
    };
  }

  const { name, email, message } = validatedFields.data;

  try {
    // 4. Send emails in parallel
    await Promise.all([
      // Primary Inquiry to you
      resend.emails.send({
        from: "Dean Miller Narration <Dean@dmnarration.com>",
        to: ["Dean@DMNarration.com"],
        subject: `New Project Inquiry: ${name}`,
        replyTo: email,
        text: `Name: ${name}\nEmail: ${email}\n\nProject Details:\n${message}`,
      }),
      // Auto-reply confirmation to the sender
      resend.emails.send({
        from: "Dean Miller Narration <Dean@dmnarration.com>",
        to: [email],
        subject: "Inquiry Received - Dean Miller Narration",
        text: `Hi ${name},\n\nThanks for reaching out! I've received your project details and will review them shortly. You can expect a response within 24-48 hours.\n\nBest,\nDean Miller`,
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