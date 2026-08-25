// Opportunistic, best-effort scrape of an Amazon book product page.
// Used to fill empty description/tags/trigger_warnings on save — never
// authoritative, never blocks a save, never throws.

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const FETCH_TIMEOUT_MS = 5000;
const MAX_ITEMS = 15;

export type AmazonBookResult = {
  description: string | null;
  tags: string[];
  triggerWarnings: string[];
  /** Publication date as YYYY-MM-DD, when the page states one. */
  releaseDate: string | null;
};

// ─── HTML helpers ───────────────────────────────────────────────────────────

// Balances nested <div>...</div> pairs starting right after an opening tag,
// so we don't cut off partway through the content (a naive "next </div>"
// regex would stop at the first nested closing tag).
function extractBalanced(html: string, openTagEnd: number): string | null {
  const divRe = /<div\b[^>]*>|<\/div>/gi;
  divRe.lastIndex = openTagEnd;
  let depth = 1;
  let m: RegExpExecArray | null;
  while ((m = divRe.exec(html))) {
    if (m[0][1] === "/") {
      depth--;
      if (depth === 0) return html.slice(openTagEnd, m.index);
    } else {
      depth++;
    }
  }
  return null; // unbalanced — bail rather than guess
}

function extractElementById(html: string, id: string): string | null {
  const openTagRe = new RegExp(`<div[^>]*\\bid=["']${id}["'][^>]*>`, "i");
  const openMatch = openTagRe.exec(html);
  if (!openMatch) return null;
  return extractBalanced(html, openMatch.index + openMatch[0].length);
}

// Finds the first <div> whose class attribute contains `className` as a
// whitespace-separated token (not just a substring — avoids matching
// "a-expander-content-fade" when looking for "a-expander-content").
function extractElementByClass(html: string, className: string): string | null {
  const tokenRe = new RegExp(`(^|\\s)${className}(\\s|$)`);
  const divOpenRe = /<div\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = divOpenRe.exec(html))) {
    const classMatch = /class=["']([^"']*)["']/i.exec(m[0]);
    if (classMatch && tokenRe.test(classMatch[1])) {
      return extractBalanced(html, m.index + m[0].length);
    }
  }
  return null;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&rsquo;/g, "’")
    .replace(/&lsquo;/g, "‘")
    .replace(/&rdquo;/g, "”")
    .replace(/&ldquo;/g, "“");
}

// Converts block-level HTML into newlines before stripping tags, so
// paragraph breaks survive as plain-text line breaks.
function htmlToText(html: string): string {
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "\n")
    .replace(/<\/li>/gi, "")
    .replace(/<\/div>/gi, "\n");
  const stripped = withBreaks.replace(/<[^>]+>/g, "");
  return decodeEntities(stripped)
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ─── description extraction ─────────────────────────────────────────────────

/**
 * Every node in the page's JSON-LD blocks, flattened.
 *
 * Amazon is inconsistent about the shape: sometimes a bare object, sometimes
 * an array, sometimes wrapped in "@graph". Three extractors were each walking
 * that by hand. Unparseable blocks are skipped rather than thrown, so one
 * malformed script tag cannot hide the others behind it.
 */
function jsonLdNodes(html: string): Record<string, unknown>[] {
  const nodes: Record<string, unknown>[] = [];
  const scriptRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = scriptRe.exec(html))) {
    let parsed: unknown;
    try { parsed = JSON.parse(m[1].trim()); } catch { continue; }
    const candidates = Array.isArray(parsed) ? parsed : [parsed];
    for (const obj of candidates) {
      if (!obj || typeof obj !== "object") continue;
      const record = obj as Record<string, unknown>;
      const items = Array.isArray(record["@graph"]) ? (record["@graph"] as Record<string, unknown>[]) : [record];
      for (const item of items) {
        if (item && typeof item === "object") nodes.push(item);
      }
    }
  }
  return nodes;
}

/**
 * Publication date, as YYYY-MM-DD.
 *
 * Two sources, because Amazon is inconsistent about which it renders. The
 * JSON-LD datePublished is already an ISO date when present; the product detail
 * row is human text like "Publication date ‏ : ‎ July 17, 2026" and has to be
 * parsed. Anything that does not resolve to a real date is discarded rather
 * than guessed at — a wrong release date on the public page is worse than none.
 */
function extractReleaseDate(html: string): string | null {
  for (const item of jsonLdNodes(html)) {
    const raw = item.datePublished ?? item.dateCreated;
    if (typeof raw === "string" && raw.trim()) {
      const d = new Date(raw.trim());
      if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
  }

  // "Publication date" / "Release date" / "Audible.com Release Date", followed
  // by Amazon's separator characters and then the date itself.
  const rowRe = /(?:publication date|release date)[^A-Za-z0-9]{0,40}([A-Z][a-z]+ \d{1,2},? \d{4})/i;
  const row = rowRe.exec(html.replace(/<[^>]+>/g, " "));
  if (row) {
    const d = new Date(row[1]);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }

  return null;
}

function extractJsonLdDescription(html: string): string | null {
  for (const item of jsonLdNodes(html)) {
    const type = item["@type"];
    const isBook = type === "Book" || (Array.isArray(type) && type.includes("Book"));
    if (isBook && typeof item.description === "string" && item.description.trim()) {
      return item.description;
    }
  }
  return null;
}

function extractDescriptionDiv(html: string): string | null {
  const outer = extractElementById(html, "bookDescription_feature_div");
  if (!outer) return null;
  // Prefer the actual text container — the outer feature div also contains
  // sibling "Read more"/"Read less" toggle-button markup we don't want.
  return extractElementByClass(outer, "a-expander-content") ?? outer;
}

// ─── tropes / content-warning / trigger-warning parsing ─────────────────────

const LABEL_PATTERNS: { field: "tags" | "triggerWarnings"; regex: RegExp }[] = [
  { field: "tags", regex: /Tropes(?:\s+include)?\s*[:\-–]\s*/i },
  { field: "triggerWarnings", regex: /(?:Content\s+warnings?|CWs?|Content\s+notes?)\s*[:\-–]\s*/i },
  { field: "triggerWarnings", regex: /(?:Trigger\s+warnings?|TWs?)\s*[:\-–]\s*/i },
];

// Grabs the text following a label match, up to whichever comes first: a
// blank line, the next labeled section, or the end of the description.
function captureBlock(text: string, afterIndex: number): string {
  const rest = text.slice(afterIndex);
  let end = rest.length;

  const blankLine = rest.search(/\n\s*\n/);
  if (blankLine !== -1) end = Math.min(end, blankLine);

  for (const { regex } of LABEL_PATTERNS) {
    const re = new RegExp(regex.source, regex.flags.includes("i") ? "i" : "");
    // Search starting just past the current position so the label we just
    // matched can't immediately re-match itself at index 0.
    const m = re.exec(rest.slice(1));
    if (m) end = Math.min(end, m.index + 1);
  }

  return rest.slice(0, end);
}

function splitItems(block: string): string[] {
  const normalized = block
    .replace(/^[•*\-]\s*/gm, "\n") // bullets at line start become plain separators
    .replace(/\n+/g, ",");
  return Array.from(
    new Set(
      normalized
        .split(/[,;]/)
        .map(s => s.trim().replace(/^[•*\-]\s*/, "").replace(/[.\s]+$/, ""))
        .map(s => s.toLowerCase())
        .filter(Boolean)
    )
  ).slice(0, MAX_ITEMS);
}

function parseTropesAndWarnings(text: string): { tags: string[]; triggerWarnings: string[] } {
  const tags: string[] = [];
  const triggerWarnings: string[] = [];

  for (const { field, regex } of LABEL_PATTERNS) {
    const m = regex.exec(text);
    if (!m) continue;
    const block = captureBlock(text, m.index + m[0].length);
    const items = splitItems(block);
    if (!items.length) continue;
    if (field === "tags") tags.push(...items);
    else triggerWarnings.push(...items);
  }

  return {
    tags: Array.from(new Set(tags)).slice(0, MAX_ITEMS),
    triggerWarnings: Array.from(new Set(triggerWarnings)).slice(0, MAX_ITEMS),
  };
}

// ─── main entry point ────────────────────────────────────────────────────────

/** Why a fetch produced nothing, for callers that can act on the difference. */
export type AmazonFailure = "blocked" | "not-found" | "no-description" | "network";

export type AmazonFetchResult =
  | { ok: true; data: AmazonBookResult }
  | { ok: false; reason: AmazonFailure; detail: string };

/**
 * Unchanged signature for the save-time auto-fill, which only needs to know
 * whether it got anything.
 */
export async function fetchAmazonBook(url: string): Promise<AmazonBookResult | null> {
  const result = await fetchAmazonBookResult(url);
  return result.ok ? result.data : null;
}

type AmazonHtmlResult =
  | { ok: true; html: string }
  | { ok: false; reason: AmazonFailure; detail: string };

/**
 * One Amazon page fetch: browser-realistic headers, timeout, and the two
 * block-page checks every caller needs.
 *
 * Split out when the rating refresh needed the same request and the same
 * definition of "Amazon refused us". The headers are load bearing and were
 * arrived at by trial against Amazon's bot detection — a second copy drifting
 * out of sync would be a worse problem than the indirection.
 *
 * `tag` prefixes the diagnostic log lines so a failure is attributable to the
 * caller that caused it.
 */
async function fetchAmazonHtml(url: string, tag: string): Promise<AmazonHtmlResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          "Accept-Language": "en-US,en;q=0.9",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          // Amazon's bot detection treats a bare UA + Accept as suspicious even
          // when it matches a real Chrome string — these are the additional
          // headers an actual Chrome navigation sends alongside it.
          "Accept-Encoding": "gzip, deflate, br",
          "Upgrade-Insecure-Requests": "1",
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "none",
          "Sec-Fetch-User": "?1",
          "Sec-Ch-Ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
          "Sec-Ch-Ua-Mobile": "?0",
          "Sec-Ch-Ua-Platform": '"Windows"',
        },
        signal: controller.signal,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.log(`${tag} failed: ${url} -> ${reason}`);
      return { ok: false, reason: "network", detail: reason };
    }

    if (!res.ok) {
      console.log(`${tag} failed: ${url} -> HTTP ${res.status}`);
      return {
        ok: false,
        reason: res.status === 404 ? "not-found" : "blocked",
        detail: `HTTP ${res.status}`,
      };
    }

    const rawHtml = await res.text();

    // Two distinct block signals, logged separately so a coverage drop is easy
    // to diagnose later: a hard image-CAPTCHA challenge vs. the softer
    // "click to continue" interstitial (observed in practice — Amazon's
    // wording for this varies and doesn't always match either literally).
    if (/enter the characters you see below/i.test(rawHtml) || /robotcheck/i.test(rawHtml)) {
      console.log(`${tag} failed: ${url} -> captcha challenge page`);
      return { ok: false, reason: "blocked", detail: "captcha challenge" };
    }
    if (/click the button below to continue shopping/i.test(rawHtml) || /validateCaptcha/i.test(rawHtml)) {
      console.log(`${tag} failed: ${url} -> soft-block (interstitial detected)`);
      return { ok: false, reason: "blocked", detail: "bot interstitial" };
    }

    return { ok: true, html: rawHtml };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.log(`${tag} failed: ${url} -> ${reason}`);
    return { ok: false, reason: "network", detail: reason };
  } finally {
    clearTimeout(timer);
  }
}

// Amazon duplicates the full description inside a <noscript> fallback beside
// the JS-rendered expander, so anything reading the page must drop those
// blocks first or it reads everything twice.
function stripNoscript(html: string): string {
  return html.replace(/<noscript[\s\S]*?<\/noscript>/gi, "");
}

export async function fetchAmazonBookResult(url: string): Promise<AmazonFetchResult> {
  const page = await fetchAmazonHtml(url, "[amazon-scrape]");
  if (!page.ok) return { ok: false, reason: page.reason, detail: page.detail };

  const html = stripNoscript(page.html);

  const rawDescription = extractJsonLdDescription(html) ?? extractDescriptionDiv(html);
  if (!rawDescription) {
    console.log(`[amazon-scrape] failed: ${url} -> no description found`);
    return { ok: false, reason: "no-description", detail: "no description in page" };
  }

  const description = htmlToText(rawDescription);
  if (!description) {
    console.log(`[amazon-scrape] failed: ${url} -> empty description after cleaning`);
    return { ok: false, reason: "no-description", detail: "description was empty after cleaning" };
  }

  const { tags, triggerWarnings } = parseTropesAndWarnings(description);
  const releaseDate = extractReleaseDate(html);
  console.log(
    `[amazon-scrape] fetched: ${url} -> description=yes, tags=${tags.length}, ` +
    `tw=${triggerWarnings.length}, released=${releaseDate ?? "none"}`
  );
  return { ok: true, data: { description, tags, triggerWarnings, releaseDate } };
}

// ─── rating extraction ──────────────────────────────────────────────────────

/**
 * The star rating and review count shown on a product page, used to rank the
 * Completed section of /narrated-works.
 *
 * Verified against a real product page (Beating for You, B0H96P58FB, captured
 * from a residential connection because Amazon serves this server a bot
 * interstitial). That page carried no JSON-LD aggregateRating at all, and
 * fourteen distinct "N out of 5 stars" values — related products, individual
 * review stars — of which exactly one was the book's own. So order matters
 * here: the unique structural anchors come first, and there is deliberately no
 * loose text sweep, because on a real page a loose sweep is close to a coin
 * flip.
 */
export type AmazonRatingData = {
  /** 0-5, rounded to one decimal to match the stored column. */
  rating: number;
  /** Null when the page shows a rating but no countable review total. */
  reviewCount: number | null;
};

export type AmazonRatingFailure = AmazonFailure | "no-rating";

export type AmazonRatingResult =
  | { ok: true; data: AmazonRatingData }
  | { ok: false; reason: AmazonRatingFailure; detail: string };

// Ordered most to least trustworthy. The first pattern that yields a value in
// range wins, so a precise structural match is preferred over a loose text
// sweep that could pick up a rating belonging to a "related products" strip.
const RATING_PATTERNS: RegExp[] = [
  // title="3.6 out of 5 stars" on the buy-box popover. Unique on the page and
  // unambiguously this book's, so it is tried first.
  /id=["']acrPopover["'][^>]*\btitle=["']\s*([0-5](?:\.\d)?)\s+out of\s+5\s+stars/i,
  // >3.6 out of 5< in the reviews module. Also unique, and survives layouts
  // that drop the popover.
  /data-hook=["']rating-out-of-text["'][^>]*>\s*([0-5](?:\.\d)?)\s+out of\s+5/i,
  // Screen-reader text inside a star icon. Last because the page carries
  // eighteen of these and only the first belongs to this book — reached only
  // when both anchors above are missing, which would mean the layout moved.
  /<span[^>]*\bclass=["'][^"']*\ba-icon-alt\b[^"']*["'][^>]*>\s*([0-5](?:\.\d)?)\s+out of\s+5\s+stars\s*<\/span>/i,
];

const REVIEW_COUNT_PATTERNS: RegExp[] = [
  // aria-label="35 Reviews" on the buy-box count. The visible text beside it is
  // only "(35)", so the label is where the number appears plainly.
  /id=["']acrCustomerReviewText["'][^>]*\baria-label=["']\s*([\d,]+)/i,
  // >35 global ratings< in the reviews module.
  /data-hook=["']total-review-count["'][^>]*>\s*([\d,]+)/i,
  // The visible buy-box text, whether Amazon renders it "(35)" or "35 ratings".
  /id=["']acrCustomerReviewText["'][^>]*>\s*\(?\s*([\d,]+)/i,
  // Safe as a sweep in a way the rating equivalent is not: the phrase occurs
  // exactly once on the page, attached to this book.
  /([\d,]+)\s+global\s+ratings?/i,
];

/**
 * aggregateRating from JSON-LD, when Amazon emits it.
 *
 * Preferred over the markup patterns because it is data rather than
 * presentation, so it does not move when the page layout changes. Amazon does
 * not always include it, hence the fallbacks.
 */
function extractJsonLdRating(html: string): { rating: number | null; count: number | null } {
  for (const item of jsonLdNodes(html)) {
    const agg = item.aggregateRating;
    if (!agg || typeof agg !== "object") continue;
    const record = agg as Record<string, unknown>;
    const rating = toRating(record.ratingValue);
    const count = toCount(record.ratingCount ?? record.reviewCount);
    if (rating !== null || count !== null) return { rating, count };
  }
  return { rating: null, count: null };
}

// A rating outside 0-5 is not a rating we misread, it is a number that meant
// something else — discard rather than clamp, so a bad parse stays visible as
// "no rating" instead of silently writing a plausible-looking 5.0.
function toRating(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n) || n < 0 || n > 5) return null;
  return Math.round(n * 10) / 10;
}

function toCount(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).replace(/,/g, "").trim());
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return null;
  return n;
}

function firstMatch(html: string, patterns: RegExp[], convert: (raw: string) => number | null): number | null {
  for (const re of patterns) {
    const m = re.exec(html);
    if (!m) continue;
    const value = convert(m[1]);
    if (value !== null) return value;
  }
  return null;
}

/**
 * Read a book's current rating from its Amazon page.
 *
 * Returns a reason rather than null on failure so the caller can log why —
 * "blocked" (Amazon refused the server, which is the common case today) reads
 * very differently from "no-rating" (the page loaded and the book genuinely
 * has no reviews yet), and only the second is a fact about the book.
 */
export async function fetchAmazonRating(url: string): Promise<AmazonRatingResult> {
  const page = await fetchAmazonHtml(url, "[amazon-rating]");
  if (!page.ok) return { ok: false, reason: page.reason, detail: page.detail };

  const html = stripNoscript(page.html);

  const jsonLd = extractJsonLdRating(html);
  const rating = jsonLd.rating ?? firstMatch(html, RATING_PATTERNS, toRating);
  if (rating === null) {
    return { ok: false, reason: "no-rating", detail: "no rating found on page" };
  }

  // Not required. A rating with no readable count is still worth storing —
  // it is the primary sort key — and leaving the count alone is better than
  // overwriting a good stored value with null.
  const reviewCount = jsonLd.count ?? firstMatch(html, REVIEW_COUNT_PATTERNS, toCount);

  console.log(`[amazon-rating] fetched: ${url} -> rating=${rating}, count=${reviewCount ?? "none"}`);
  return { ok: true, data: { rating, reviewCount } };
}
