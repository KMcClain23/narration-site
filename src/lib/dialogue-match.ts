// Ported directly from the Phase 3 build plan — validated in testing.
// Locates a Claude-returned dialogue string inside a chapter's raw_text via
// exact match first, falling back to a fuzzy pattern that tolerates quote-
// character variants (straight vs curly), dash variants, and whitespace
// differences the model may have introduced when copying the line.

function escapeRegexChar(c: string) {
  return c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildFuzzyPattern(target: string): string {
  const isApos = (c: string) => /['‘’]/.test(c);
  const isQuote = (c: string) => /["“”]/.test(c);
  const isDash = (c: string) => /[-‐-―]/.test(c);
  const isSpace = (c: string) => /\s/.test(c);
  const chars = Array.from(target);
  const parts = chars.map((c) => {
    if (isApos(c)) return "['‘’]";
    if (isQuote(c)) return '["“”]';
    if (isDash(c)) return "[-‐-―]";
    if (isSpace(c)) return "\\s+";
    return escapeRegexChar(c);
  });
  if (parts.length && isQuote(chars[0])) parts[0] += "?";
  if (parts.length && isQuote(chars[chars.length - 1])) parts[parts.length - 1] += "?";
  return parts.join("") + "[,.\\-–—]?";
}

export interface MatchResult {
  start: number;
  end: number;
}

/**
 * Search `text` for `target`, starting at `fromIndex`. Exact substring match
 * first; if that fails, a fuzzy regex match tolerant of quote/dash/whitespace
 * variants. Returns absolute offsets into `text`, or null if neither matches.
 */
export function findMatch(text: string, target: string, fromIndex: number): MatchResult | null {
  const hay = text.slice(fromIndex);
  const idx = hay.indexOf(target);
  if (idx !== -1) return { start: fromIndex + idx, end: fromIndex + idx + target.length };
  try {
    const m = new RegExp(buildFuzzyPattern(target)).exec(hay);
    if (m) return { start: fromIndex + m.index, end: fromIndex + m.index + m[0].length };
  } catch {
    // malformed pattern (pathological input) — fall through to null
  }
  return null;
}
