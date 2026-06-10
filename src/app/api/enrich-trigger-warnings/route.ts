import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(req: Request) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });
    }

    const { id, title, author, description, tags } = await req.json();
    if (!id || !title) {
      return NextResponse.json({ error: "id and title required" }, { status: 400 });
    }

    const context = [
      description && `Description: ${description}`,
      tags?.length && `Genre/tags: ${(tags as string[]).join(", ")}`,
    ]
      .filter(Boolean)
      .join("\n");

    const prompt = `You are a content advisory assistant for an audiobook narrator's portfolio site. Your job is to generate accurate trigger warnings for books so readers can make informed choices.

Book: "${title}"${author ? ` by ${author}` : ""}
${context ? `\n${context}\n` : ""}
Generate a list of trigger warnings for this book. Use your knowledge of the published book if you know it. If you don't know the specific book, infer from the genre, description, and any available context — but be conservative and don't fabricate specific plot details.

Rules:
- List only genuine content warnings a reader might need (violence, sexual content, trauma, abuse, etc.)
- Keep each warning concise (2–6 words), lowercase
- Do not include spoilers or plot summaries
- Return 0 warnings if the book is genuinely light/mild
- Aim for 3–10 warnings; more only when the content truly warrants it
- Do not add warnings just to be comprehensive — only include what actually applies

Respond ONLY with a JSON array of strings, no markdown, no explanation:
["warning one", "warning two", ...]`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error("[enrich-trigger-warnings] Anthropic error:", response.status, errBody);
      return NextResponse.json({ error: `Anthropic API error: ${response.status}` }, { status: 500 });
    }

    const data = await response.json();
    const text: string = data.content?.[0]?.text ?? "[]";
    const clean = text.replace(/```json|```/g, "").trim();

    let warnings: string[];
    try {
      const parsed = JSON.parse(clean);
      warnings = Array.isArray(parsed) ? parsed.filter((w): w is string => typeof w === "string") : [];
    } catch {
      console.error("[enrich-trigger-warnings] Failed to parse response:", clean);
      return NextResponse.json({ enriched: false, reason: "invalid response from AI" });
    }

    const { error } = await supabaseAdmin
      .from("board_cards")
      .update({ trigger_warnings: warnings, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      console.error("[enrich-trigger-warnings] Supabase error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ enriched: true, trigger_warnings: warnings });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    console.error("[enrich-trigger-warnings] Exception:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
