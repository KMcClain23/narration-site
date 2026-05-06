// GET /api/fetch-description?title=...&author=...
// Fetches a cleaned book description from Google Books, falling back to
// Open Library if the Google result is missing or truncated.

import { NextResponse } from "next/server";

// ── helpers ───────────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function truncateClean(text: string, max = 500): string {
  if (text.length <= max) return text;
  const sub = text.slice(0, max);
  // Find last clean sentence break
  const lastBreak = Math.max(
    sub.lastIndexOf(". "),
    sub.lastIndexOf("! "),
    sub.lastIndexOf("? ")
  );
  return lastBreak > max / 2 ? sub.slice(0, lastBreak + 1) : sub.trimEnd() + "…";
}

function looksIncomplete(text: string): boolean {
  const t = text.trimEnd();
  return t.endsWith("...") || t.endsWith("…") || t.length < 80;
}

// ── sources ───────────────────────────────────────────────────────────────────

async function fromGoogleBooks(title: string, author: string): Promise<string | null> {
  const q = author
    ? `intitle:${encodeURIComponent(title)}+inauthor:${encodeURIComponent(author)}`
    : encodeURIComponent(title);
  try {
    const res = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=5&printType=books`,
      { next: { revalidate: 86400 } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    // Walk up to 5 results; take the first with a description
    for (const item of (data.items ?? []).slice(0, 5)) {
      const desc: string = item.volumeInfo?.description ?? "";
      if (desc.length > 60) return stripHtml(desc);
    }
  } catch { /* ignore */ }
  return null;
}

async function fromOpenLibrary(title: string, author: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&author=${encodeURIComponent(author)}&limit=3&fields=first_sentence,subtitle`,
      { next: { revalidate: 86400 } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    for (const doc of (data.docs ?? []).slice(0, 3)) {
      // first_sentence can be a string or {value: string}
      const raw = doc.first_sentence;
      const sentence: string =
        typeof raw === "string" ? raw : (raw?.value ?? "");
      const subtitle: string = doc.subtitle ?? "";
      const best = sentence || subtitle;
      if (best.length > 40) return best;
    }
  } catch { /* ignore */ }
  return null;
}

// ── handler ───────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const title  = (searchParams.get("title")  ?? "").trim();
  const author = (searchParams.get("author") ?? "").trim();

  if (!title) {
    return NextResponse.json({ error: "title required" }, { status: 400 });
  }

  let description = await fromGoogleBooks(title, author);

  // Fall back to Open Library if nothing found or result looks cut off
  if (!description || looksIncomplete(description)) {
    const olDesc = await fromOpenLibrary(title, author);
    if (olDesc && olDesc.length > (description?.length ?? 0)) {
      description = olDesc;
    }
  }

  if (!description) {
    return NextResponse.json({ description: null });
  }

  return NextResponse.json({ description: truncateClean(description) });
}
