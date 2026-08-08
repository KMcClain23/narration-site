import { NextResponse } from "next/server";
import { fetchAmazonBookResult } from "@/lib/amazon-scrape";

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

    const result = await fetchAmazonBookResult(url.trim());

    if (!result.ok) {
      // The reason matters. A block is Amazon refusing this server, which no
      // amount of correcting the URL will fix and which the save-time
      // auto-fill hits silently for the same reason. Saying "did not return a
      // readable page" made it look like a bad link.
      const message: Record<typeof result.reason, string> = {
        blocked:
          "Amazon blocked the request. It serves a bot check to datacentre addresses, " +
          "so this will keep failing from the server regardless of the link. Copy the " +
          "description across by hand for now.",
        "not-found": "Amazon returned 404 for that link. Check the URL on the card.",
        "no-description": "Amazon loaded, but the page had no description to read.",
        network: "Could not reach Amazon.",
      };
      return NextResponse.json(
        { error: message[result.reason], reason: result.reason },
        { status: result.reason === "not-found" ? 400 : 502 }
      );
    }

    return NextResponse.json({
      description: result.data.description ?? "",
      tags: result.data.tags,
      triggerWarnings: result.data.triggerWarnings,
    });
  } catch (e) {
    console.error("[POST /api/board/amazon-preview]", e);
    return NextResponse.json({ error: "Could not reach Amazon." }, { status: 500 });
  }
}
