"use server";

import { Resend } from "resend";
import { z } from "zod";

const resend = new Resend(process.env.RESEND_API_KEY);

const contactSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Please enter a valid email address"),
  message: z.string().min(10, "Please provide a bit more detail (min 10 chars)"),
});

export async function sendEmail(formData: FormData) {
  // 1. Honeypot check (bot protection)
  const honeypot = formData.get("_hp_name");
  if (honeypot) return { success: true }; // Silent fail for bots

  // 2. Validate data
  const validatedFields = contactSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    message: formData.get("message"),
  });

  if (!validatedFields.success) {
    return { 
      success: false, 
      error: validatedFields.error.flatten().fieldErrors 
    };
  }

  const { name, email, message } = validatedFields.data;

  try {
    const { error } = await resend.emails.send({
      from: "Dean Miller Narration <onboarding@resend.dev>",
      to: ["Dean@DMNarration.com"],
      subject: `New Project Inquiry: ${name}`,
      replyTo: email,
      text: `Name: ${name}\nEmail: ${email}\n\nDetails:\n${message}`,
    });

    if (error) return { success: false, error: "Service currently unavailable." };
    return { success: true };
  } catch (err) {
    return { success: false, error: "An unexpected error occurred." };
  }
}