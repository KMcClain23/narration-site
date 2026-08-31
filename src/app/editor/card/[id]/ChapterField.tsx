"use client";

import type { ChapterEntry } from "@/lib/editor-data";

/**
 * Which chapter a pickup is against — THREE CASES, because the data has three.
 *
 *   an array (10 of 33 cards)   a picker of real chapters
 *   chapters_total only (1)     a picker of 1…N
 *   neither (22 of 33)          the free-text input, unchanged
 *
 * THE THIRD CASE IS THE MAJORITY and it must keep working exactly as it did. A
 * picker built and tested against the one book with chapters_total would look
 * finished and would have broken twenty-two books.
 *
 * WHAT IS STORED IS THE SAME STRING IN ALL THREE CASES. `create_pickup` takes
 * free text, `card_cast` and the sender group by that text, and the OneDrive
 * manifest is named from it — so the picker changes what she types, never what
 * is written. Front matter stores its bare title ("Prologue"), because it has no
 * number to store and inventing one would put a fake chapter in the path.
 */
export function ChapterField({
  chapters,
  chaptersTotal,
  value,
  onChange,
}: {
  chapters: ChapterEntry[] | null;
  chaptersTotal: number | null;
  value: string;
  onChange: (v: string) => void;
}) {
  const options = chapterOptions(chapters, chaptersTotal);

  const field =
    "w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-[#D4AF37]/50 focus:outline-none";

  if (options.length === 0) {
    // The 22 with no chapter data at all. Unchanged on purpose.
    return (
      <input
        placeholder="Chapter"
        value={value}
        onChange={e => onChange(e.target.value)}
        className={field}
        aria-label="Chapter"
      />
    );
  }

  return (
    <select
      value={options.includes(value) ? value : ""}
      onChange={e => onChange(e.target.value)}
      className={field}
      aria-label="Chapter"
    >
      <option value="" className="bg-[#0A0D3A]">
        Which chapter?
      </option>
      {options.map(o => (
        <option key={o} value={o} className="bg-[#0A0D3A]">
          {/^\d+$/.test(o) ? `Chapter ${o}` : o}
        </option>
      ))}
    </select>
  );
}

/**
 * The stored strings, in reading order.
 *
 * A numbered chapter stores its number, so it matches what the 22 free-text
 * books already store and nothing downstream has to learn a second shape.
 */
export function chapterOptions(
  chapters: ChapterEntry[] | null,
  chaptersTotal: number | null,
): string[] {
  if (Array.isArray(chapters) && chapters.length > 0) {
    return chapters
      .map(c =>
        c.number != null ? String(c.number) : (c.title ?? "").trim(),
      )
      .filter(v => v.length > 0);
  }
  if (chaptersTotal && chaptersTotal > 0) {
    return Array.from({ length: chaptersTotal }, (_, i) => String(i + 1));
  }
  return [];
}

/**
 * Where she is most likely working: one past what she has edited, or the chapter
 * of her most recent pickup on this card — whichever is further along.
 *
 * Only ever a DEFAULT. It is offered as the selected value and she can change
 * it; on a book with no chapter data it seeds the free-text field with nothing,
 * because guessing into a text box she then has to clear is worse than empty.
 */
export function defaultChapter(
  options: string[],
  chaptersEdited: number | null,
  lastPickupChapter: string | null,
): string {
  if (options.length === 0) return "";
  const next = (chaptersEdited ?? 0) + 1;
  const fromProgress = options.includes(String(next)) ? String(next) : "";
  if (!lastPickupChapter) return fromProgress;

  const li = options.indexOf(lastPickupChapter);
  const pi = fromProgress ? options.indexOf(fromProgress) : -1;
  // "Whichever is later" means further through the book, which is position in
  // the list — not numeric order, since front matter has no number.
  return li > pi ? lastPickupChapter : fromProgress || (li >= 0 ? lastPickupChapter : "");
}
