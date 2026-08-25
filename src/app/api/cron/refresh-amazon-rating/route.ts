import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchAmazonRating } from "@/lib/amazon-scrape";

// One book, one fetch, a five-second timeout. Nothing here sleeps, so the run
// finishes in seconds and the platform's cron ceiling is never in play.
export const maxDuration = 60;

const TAG = "[amazon-rating-refresh]";

/**
 * Books refreshed per invocation. The cron fires three times a day (see
 * vercel.json), so this is three books a day — a full pass over the twelve
 * released titles every four days.
 *
 * An earlier design did three books in one run with a 3-10 minute sleep
 * between them, to space the requests out. That was dropped for two reasons:
 * the worst case ran 20 minutes, past the 800s function ceiling, and the
 * spacing bought nothing anyway. Amazon blocks this server on datacentre IP
 * reputation, decided on the first request — not on how fast requests arrive.
 * Sleeping in a billed function to defeat a mechanism that ignores timing is
 * cost without benefit. Three cheap invocations spread across the day give the
 * same coverage and the same spacing, for seconds of compute.
 */
const BOOKS_PER_RUN = 1;

/**
 * How many candidates to pull before filtering. Comfortably more than the
 * released catalogue, so a run that has to skip several unusable links still
 * finds a real one to fetch instead of going idle.
 */
const POOL_SIZE = 25;

type Candidate = {
  id: string;
  title: string;
  audible_link: string | null;
  released_at: string | null;
  amazon_rating_attempted_at: string | null;
};

// audible.com is deliberately excluded, not merely unhandled: its bot
// protection is more aggressive than amazon.com's and Stage 6.2 established
// that requests to it are not worth making. Today every released book happens
// to carry an amazon.com URL, so this filter skips nothing — it exists so that
// the first audible-only link added later is skipped rather than wasting the
// run and logging a confusing block.
function isAmazonUrl(url: string | null): boolean {
  return typeof url === "string" && /^https?:\/\/(www\.)?amazon\.com\//i.test(url.trim());
}

function log(title: string, status: string) {
  console.log(`${TAG} book="${title}" status=${status}`);
}

async function stampAttempt(id: string, at: string) {
  const { error } = await supabaseAdmin
    .from("board_cards")
    .update({ amazon_rating_attempted_at: at })
    .eq("id", id);
  // Logged, not thrown. A failed stamp costs this book its place in the
  // rotation for one cycle; failing the whole run would cost every book.
  if (error) console.error(`${TAG} could not stamp attempt for ${id}:`, error.message);
}

/**
 * Refresh one released book's Amazon rating.
 *
 * Selection is a single ordered query — attempted-at ascending with nulls
 * first, then release date ascending — which encodes both priorities at once:
 * never-attempted books come first, oldest release first among them, and after
 * that the least recently attempted book wins.
 *
 * That ordering is what guarantees rotation. Every attempt stamps
 * amazon_rating_attempted_at with the current time, which makes that row the
 * newest in the ordering and therefore the last one the next run will consider.
 * A book cannot be picked again until every other eligible book has been
 * attempted more recently than it.
 *
 * The stamp is unconditional, and that is the point. Stamping only on success
 * would mean that while Amazon is blocking every request — which it is doing
 * today — the same book would be selected at 04:00, 12:00 and 20:00 forever
 * and no other book would ever be reached. Rating values are still only
 * written on a real parse, so a failure never disturbs stored data: the two
 * columns answer different questions, "when did we last try" and "when did we
 * last learn something".
 */
export async function GET(req: Request) {
  // Vercel signs cron requests with CRON_SECRET when it is configured. Same
  // check the extraction cron uses, against the same project-wide variable.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else {
    console.warn(`${TAG} CRON_SECRET is not set — this endpoint is unauthenticated`);
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("board_cards")
      .select("id, title, audible_link, released_at, amazon_rating_attempted_at")
      .eq("status", "released")
      .is("archived_at", null)
      .order("amazon_rating_attempted_at", { ascending: true, nullsFirst: true })
      .order("released_at", { ascending: true, nullsFirst: false })
      .limit(POOL_SIZE);

    if (error) {
      console.error(`${TAG} could not read candidates:`, error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const pool = (data ?? []) as Candidate[];
    const now = new Date().toISOString();

    // Unusable links are stamped too. They are genuinely "attempted" as far as
    // rotation is concerned, and leaving them unstamped would park them at the
    // head of the queue permanently, which is the same starvation the
    // unconditional stamp above exists to prevent.
    const eligible: Candidate[] = [];
    for (const row of pool) {
      if (isAmazonUrl(row.audible_link)) {
        eligible.push(row);
        continue;
      }
      log(row.title, row.audible_link?.trim() ? "failed:not-amazon-url" : "failed:no-url");
      await stampAttempt(row.id, now);
    }

    const selected = eligible.slice(0, BOOKS_PER_RUN);
    if (!selected.length) {
      console.log(`${TAG} no eligible books to refresh`);
      return NextResponse.json({ idle: true, refreshed: 0 });
    }

    let refreshed = 0;
    let failed = 0;

    for (const book of selected) {
      // Each book is independent: a thrown error here must not abandon the
      // rest of the run or leave the attempt unstamped.
      try {
        const result = await fetchAmazonRating(book.audible_link as string);
        const stampedAt = new Date().toISOString();

        if (!result.ok) {
          log(book.title, `failed:${result.reason}`);
          await stampAttempt(book.id, stampedAt);
          failed++;
          continue;
        }

        const update: Record<string, unknown> = {
          amazon_rating: result.data.rating,
          amazon_rating_updated_at: stampedAt,
          amazon_rating_attempted_at: stampedAt,
        };
        // Only written when the page actually stated one — otherwise a page
        // that showed a rating but no count would wipe a good stored count.
        if (result.data.reviewCount !== null) {
          update.amazon_review_count = result.data.reviewCount;
        }

        // updated_at is deliberately left alone. It tracks human edits to a
        // card, and a background refresh is not one.
        const { error: writeError } = await supabaseAdmin
          .from("board_cards")
          .update(update)
          .eq("id", book.id);

        if (writeError) {
          log(book.title, "failed:write-error");
          console.error(`${TAG} write failed for ${book.id}:`, writeError.message);
          // Stamped anyway: the fetch did happen, and this book must not hold
          // the head of the queue because the database write went wrong.
          await stampAttempt(book.id, stampedAt);
          failed++;
          continue;
        }

        log(book.title, "success");
        refreshed++;
      } catch (e) {
        const message = e instanceof Error ? e.message : "unknown error";
        log(book.title, "failed:unexpected");
        console.error(`${TAG} unexpected failure for ${book.id}:`, message);
        await stampAttempt(book.id, new Date().toISOString());
        failed++;
      }
    }

    return NextResponse.json({ refreshed, failed, considered: selected.length });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error(`${TAG} run failed:`, message);
    // 500 so a persistently broken run shows up in Vercel's cron history
    // rather than as a series of successful no-ops.
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
