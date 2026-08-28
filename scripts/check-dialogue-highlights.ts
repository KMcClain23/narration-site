/**
 * Dialogue highlights must cover quoted material and nothing else.
 *
 * Usage (from project root):
 *   npm run check-dialogue-highlights
 *
 * This exists because the prep PDF highlighted narration. The stored spans are
 * not per-quotation — they are per SPEAKING TURN, because the extraction prompt
 * asks for "every line of spoken dialogue, copied verbatim", and for a split
 * quotation
 *
 *   "You scared the shit outta me," I breathed. My hand went to my chest out
 *   of pure instinct. "I thought—"
 *
 * that whole thing is one line of dialogue and one verbatim copy. The model
 * satisfied both rules. 551 spans across three books have this shape, and the
 * renderer painted exactly what it was given.
 *
 * Two things are checked, and the second is the one that matters:
 *
 *   1. Unit cases for quotedSubSpans, including the ones that bit during
 *      implementation — mixed quote styles, unbalanced quotes, no quotes at
 *      all, apostrophes, multi-sentence quotations.
 *   2. The whole corpus: for every matched span in every book, count the
 *      characters that would be highlighted while lying OUTSIDE a quotation.
 *      That number is the bug, expressed as a quantity.
 *
 * Run against live data rather than a fixture: the defect was in the data, and
 * a fixture would only have proved that the fixture was clean.
 */

import { createClient } from "@supabase/supabase-js";
import {
  narrowToQuotes,
  type SpanLite,
} from "../src/components/admin/manuscript-reader/paragraph-highlight";

const BOOKS = [
  "All The Ways I'd Die For You",
  "Joy Ride",
  "The Wolf King's Bride",
];

let failures = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.log(`  FAIL ${name}\n         expected ${e}\n         actual   ${a}`);
  }
}

/** Narrow one standalone string, returning the highlighted pieces. */
function pieces(text: string): string[] {
  const span: SpanLite = {
    id: "s",
    character_id: "c",
    start_offset: 0,
    end_offset: text.length,
    matched: true,
  };
  return narrowToQuotes([span], text, 0).map((s) =>
    text.slice(s.start_offset, s.end_offset)
  );
}

function unitCases() {
  console.log("\nquotedSubSpans");

  // The reported passage. Attribution and narration drop out; the bounding
  // quotes and the comma inside them stay.
  check(
    "split quotation loses its attribution",
    pieces(
      "“You scared the shit outta me,” I breathed. My hand went to my chest out of pure instinct. “I thought—”"
    ),
    ["“You scared the shit outta me,”", "“I thought—”"]
  );

  // Straight quotes must work. Joy Ride is entirely curly (0 straight marks),
  // Wolf King carries 2348 straight ones and mixes both styles inside one book,
  // so neither mark can be assumed and neither can be ignored.
  check("straight quotes", pieces('"Hello," she said, "again."'), [
    '"Hello,"',
    '"again."',
  ]);

  // An apostrophe is the same glyph as a single closing quote and must not
  // start or end a highlight.
  check(
    "apostrophes are not quotes",
    pieces("“I’ve got Seth’s keys,” he said."),
    ["“I’ve got Seth’s keys,”"]
  );

  // A single quotation running over several sentences stays ONE piece.
  check(
    "multi-sentence quotation stays whole",
    pieces("“Go home. Lock the door. Do not wait up.” She turned away."),
    ["“Go home. Lock the door. Do not wait up.”"]
  );

  // Same speaker twice in a row still gets two pieces — bridging them would be
  // the original bug in a subtler form.
  check(
    "adjacent same-speaker lines do not bridge",
    pieces("“Wait.” He paused. “Please.”"),
    ["“Wait.”", "“Please.”"]
  );

  // No quotation: unquoted dialogue (texts, telepathy) keeps its highlight
  // rather than losing it.
  check("unquoted dialogue is left alone", pieces("Car’s back. Same one."), [
    "Car’s back. Same one.",
  ]);

  // Unbalanced at the stored boundary — also left alone, same reason.
  check(
    "unbalanced quote is left alone",
    pieces("“Oh my god... that was the waitress,"),
    ["“Oh my god... that was the waitress,"]
  );

  // Trailing punctuation inside the quotes is included; the period after the
  // closing quote is not.
  check("punctuation inside the quotes is kept", pieces("“Stop!” loudly."), [
    "“Stop!”",
  ]);
}

/** Characters that would be highlighted while sitting outside any quotation. */
function narrationCharsIn(text: string, spans: SpanLite[]): number {
  let bad = 0;
  for (const s of spans) {
    const raw = text.slice(s.start_offset, s.end_offset);
    let inside = false;
    for (const ch of raw) {
      if (ch === '"' || ch === "“" || ch === "”") {
        inside = !inside;
        continue;
      }
      if (!inside) bad++;
    }
  }
  return bad;
}

async function corpus() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.log("\nSkipping corpus check — Supabase env not set.");
    return;
  }
  const db = createClient(url, key, { auth: { persistSession: false } });

  for (const title of BOOKS) {
    const { data: ms } = await db
      .from("manuscripts")
      .select("id, title")
      .ilike("title", title)
      .single();
    if (!ms) {
      console.log(`\n${title}: not found, skipped`);
      continue;
    }
    const { data: chapters } = await db
      .from("chapters")
      .select("id, raw_text")
      .eq("manuscript_id", ms.id);
    const text = new Map<string, string>(
      (chapters ?? []).map((c) => [c.id as string, c.raw_text as string])
    );

    const spans: (SpanLite & { chapter_id: string })[] = [];
    for (let from = 0; ; from += 1000) {
      const { data } = await db
        .from("dialogue_spans")
        .select("id, chapter_id, character_id, start_offset, end_offset, matched")
        .in("chapter_id", [...text.keys()])
        .range(from, from + 999);
      if (!data || data.length === 0) break;
      spans.push(...(data as unknown as (SpanLite & { chapter_id: string })[]));
      if (data.length < 1000) break;
    }

    let beforeChars = 0;
    let afterChars = 0;
    let beforeSpans = 0;
    let afterSpans = 0;
    for (const [chapterId, raw] of text) {
      const mine = spans.filter((s) => s.chapter_id === chapterId && s.matched);
      if (!mine.length) continue;
      beforeSpans += mine.length;
      beforeChars += narrationCharsIn(raw, mine);
      const narrowed = narrowToQuotes(mine, raw, 0);
      afterSpans += narrowed.length;
      afterChars += narrationCharsIn(raw, narrowed);
    }

    console.log(`\n${ms.title}`);
    console.log(`  highlighted spans        ${beforeSpans} -> ${afterSpans}`);
    console.log(`  narration highlighted    ${beforeChars} -> ${afterChars} chars`);
    if (afterChars > beforeChars) {
      failures++;
      console.log("  FAIL narrowing increased the narration highlighted");
    }
  }
}

async function main() {
  unitCases();
  await corpus();
  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
