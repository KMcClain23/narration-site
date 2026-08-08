import { NextResponse } from "next/server";
import { fetchAmazonBook } from "@/lib/amazon-scrape";

/**
 * Fetch what Amazon says about a book, without saving anything.
 *
 * The auto-fill on save is fill-empty-only and deliberately stays that way —
 * it exists to populate blanks, not to overwrite copy someone wrote by hand.
 * That leaves no way to say "actually, replace this", which is a real gap when
 * a description was typed as a one-line placeholder years ago.
 *
 * This endpoint answers the question without acting on it. The editor puts the
 * result into the open form, so it is visible and editable before saving, and
 * Cancel still discards it. Nothing here touches the database, which means a
 * refetch can never clobber a card by itself.
 */
export async function POST(req: Request) {
  try {
    const { url } = await req.json();

    if (typeof url !== "string" || !/^https?:\/\/(www\.)?amazon\.com\//i.test(url.trim())) {
      return NextResponse.json(
        { error: "Needs an amazon.com link. Audible and other stores cannot be read." },
        { status: 400 }
      );
    }

    const scraped = await fetchAmazonBook(url.trim());
    if (!scraped) {
      return NextResponse.json(
        { error: "Amazon did not return a readable page for that link." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      description: scraped.description ?? "",
      tags: scraped.tags,
      triggerWarnings: scraped.triggerWarnings,
    });
  } catch (e) {
    console.error("[POST /api/board/amazon-preview]", e);
    return NextResponse.json({ error: "Could not reach Amazon." }, { status: 500 });
  }
}
