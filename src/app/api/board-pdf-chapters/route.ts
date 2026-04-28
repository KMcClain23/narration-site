import { NextResponse } from "next/server";

export const config = {
  api: {
    bodyParser: false,
  },
};

// Increase body size limit for PDF uploads
export const maxDuration = 60; // 60 second timeout for Claude processing

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) return NextResponse.json({ error: "No file provided." }, { status: 400 });

    // Check file size — warn if over 20MB
    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > 30) {
      return NextResponse.json({
        error: `PDF is ${sizeMB.toFixed(1)}MB — please use a file under 30MB. Try compressing the PDF first.`
      }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");

    const prompt = `You are analyzing a book manuscript PDF for an audiobook narrator who needs to track production progress chapter by chapter.

Please extract EVERY chapter from this book and return ONLY a valid JSON array with no other text, markdown, or explanation.

For each chapter count the actual words in that chapter's text content.

Required format:
[
  {"number": 1, "title": "Chapter title or name", "wordCount": 2847, "pages": 11},
  ...
]

Rules:
- Include ALL chapters (Prologue, Epilogue, and numbered/named chapters)
- "title" should be exactly as written in the book (e.g. "One", "Chapter 1", "Prologue", "Twenty-Three")
- "wordCount" = actual word count of that chapter's body text (count every word)
- "pages" = number of pages that chapter spans
- Do NOT include: table of contents, copyright, dedication, acknowledgments, about the author, also by, bonus content
- Return ONLY the JSON array, nothing else`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY || "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
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
                  data: base64,
                },
              },
              {
                type: "text",
                text: prompt,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Anthropic error:", response.status, err);
      return NextResponse.json({ error: `API error: ${response.status} — ${err.slice(0, 200)}` }, { status: 500 });
    }

    const aiData = await response.json();
    const text = aiData.content?.[0]?.text || "";

    // Parse the JSON array from Claude's response
    const clean = text.replace(/```json|```/g, "").trim();
    const chapters = JSON.parse(clean);

    if (!Array.isArray(chapters) || chapters.length === 0) {
      throw new Error("No chapters returned");
    }

    return NextResponse.json({ chapters, source: "claude" });
  } catch (e) {
    console.error("PDF chapter extraction error:", e);
    return NextResponse.json({
      error: `Failed to extract chapters: ${e instanceof Error ? e.message : "Unknown error"}`,
    }, { status: 500 });
  }
}
