"use server";

import { Anthropic } from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "",
});

export async function extractChaptersAction(pdfBase64: string) {
  if (!pdfBase64) {
    throw new Error("No PDF data provided");
  }

  try {
    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20240620", // The correct identifier
      max_tokens: 4000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: pdfBase64,
              },
            },
            {
              type: "text",
              text: "Return a JSON array of chapters. For each chapter, include: 'title' (string) and 'word_count' (number). Return ONLY the JSON array.",
            },
          ],
        },
      ],
    });

    // @ts-ignore
    const text = response.content[0].text;
    const clean = text.replace(/```json/g, "").replace(/```/g, "").trim();
    return JSON.parse(clean);
  } catch (error: any) {
    console.error("Extraction Error:", error);
    throw new Error(error.message || "Failed to extract chapters");
  }
}