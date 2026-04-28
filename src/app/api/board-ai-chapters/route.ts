import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { title, author, pageCount, wordCount, chapterCount } = await req.json();
    if (!title) return NextResponse.json({ error: "Title required." }, { status: 400 });

    const estimatedChapters = chapterCount || Math.max(Math.round((pageCount || 250) / 15), 5);
    const estimatedWordCount = wordCount || (pageCount ? pageCount * 250 : 80000);
    const wordsPerChapter = Math.round(estimatedWordCount / estimatedChapters);
    const pagesPerChapter = Math.round((pageCount || 250) / estimatedChapters);

    const prompt = `You are helping an audiobook narrator track their production progress for the book "${title}"${author ? ` by ${author}` : ""}.

Book metadata:
- Total pages: ${pageCount || "unknown"}
- Estimated total word count: ${estimatedWordCount.toLocaleString()}
- Estimated chapters: ${estimatedChapters}

Generate a realistic chapter list for this book. If you know the actual chapter titles from the published book, use them. If not, generate plausible chapter titles that fit the genre and story.

For each chapter provide:
- number (integer, starting at 1)
- title (string - use real chapter title if known, otherwise "Chapter N" or a descriptive title)
- wordCount (integer - realistic variation around ${wordsPerChapter}, range 800-8000)
- pages (integer - realistic variation around ${pagesPerChapter}, range 3-40)

Respond ONLY with a JSON array, no markdown, no explanation:
[{"number":1,"title":"Chapter Title","wordCount":2500,"pages":10},...]

Generate exactly ${estimatedChapters} chapters.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY || "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error("Anthropic API error:", response.status, errBody);
      return NextResponse.json({ error: `Anthropic API error: ${response.status}` }, { status: 500 });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || "[]";

    // Parse the JSON response
    const clean = text.replace(/```json|```/g, "").trim();
    const chapters = JSON.parse(clean);

    if (!Array.isArray(chapters)) throw new Error("Invalid response format");

    return NextResponse.json({ chapters, estimatedChapters, estimatedWordCount });
  } catch (e) {
    console.error("AI chapter generation error:", e);
    return NextResponse.json({ error: "Failed to generate chapters." }, { status: 500 });
  }
}
