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

function extractJsonLdDescription(html: string): string | null {
  const scriptRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = scriptRe.exec(html))) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(m[1].trim());
    } catch {
      continue;
    }
    const candidates = Array.isArray(parsed) ? parsed : [parsed];
    for (const obj of candidates) {
      if (!obj || typeof obj !== "object") continue;
      const record = obj as Record<string, unknown>;
      const items = Array.isArray(record["@graph"]) ? (record["@graph"] as Record<string, unknown>[]) : [record];
      for (const item of items) {
        const type = item["@type"];
        const isBook = type === "Book" || (Array.isArray(type) && type.includes("Book"));
        if (isBook && typeof item.description === "string" && item.description.trim()) {
          return item.description;
        }
      }
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

export async function fetchAmazonBookResult(url: string): Promise<AmazonFetchResult> {
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
      console.log(`[amazon-scrape] failed: ${url} -> ${reason}`);
      return { ok: false, reason: "network", detail: reason };
    }

    if (!res.ok) {
      console.log(`[amazon-scrape] failed: ${url} -> HTTP ${res.status}`);
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
      console.log(`[amazon-scrape] failed: ${url} -> captcha challenge page`);
      return { ok: false, reason: "blocked", detail: "captcha challenge" };
    }
    if (/click the button below to continue shopping/i.test(rawHtml) || /validateCaptcha/i.test(rawHtml)) {
      console.log(`[amazon-scrape] failed: ${url} -> soft-block (interstitial detected)`);
      return { ok: false, reason: "blocked", detail: "bot interstitial" };
    }

    // Strip <noscript> blocks first — Amazon duplicates the full description
    // inside a <noscript> fallback alongside the JS-rendered expander, and
    // extracting the whole container without this would double the text.
    const html = rawHtml.replace(/<noscript[\s\S]*?<\/noscript>/gi, "");

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
    console.log(`[amazon-scrape] fetched: ${url} -> description=yes, tags=${tags.length}, tw=${triggerWarnings.length}`);
    return { ok: true, data: { description, tags, triggerWarnings } };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.log(`[amazon-scrape] failed: ${url} -> ${reason}`);
    return { ok: false, reason: "network", detail: reason };
  } finally {
    clearTimeout(timer);
  }
}
