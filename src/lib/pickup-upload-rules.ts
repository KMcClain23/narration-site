/**
 * The rules that decide what a narrator's upload is allowed to be.
 *
 * NO `server-only` HERE, deliberately: these are pure functions over bytes and
 * strings, and they are the security-critical half of the upload path — the
 * extension allowlist, the server-generated key, the filename sanitiser and the
 * magic-byte sniff. Keeping them importable is what makes them testable, and a
 * check nobody can exercise is a check nobody has checked.
 *
 * Credentials and the bucket guard live in pickup-upload.ts, which does carry
 * `server-only`.
 */

export const MAX_BYTES = 200 * 1024 * 1024; // 200 MB per file
export const MAX_FILES_PER_CONFIRM = 5;

/**
 * The allowlist, and the ONLY source of a file extension.
 *
 * The extension is derived from the content type, never from Ann's filename — a
 * filename must not be able to influence a path, and `.wav` on the end of
 * something is a claim, not a fact.
 */
export const ALLOWED: Record<string, string> = {
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/flac": "flac",
  "audio/x-flac": "flac",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
};

export function extensionFor(contentType: string): string | null {
  return ALLOWED[(contentType ?? "").toLowerCase().trim()] ?? null;
}

/**
 * The server names the object. Always.
 *
 * `{link_id}/{uuid}.{ext}` — nothing from Ann appears in it, so `../`, a colon,
 * a null byte or a 300-character name cannot reach the path at all. There is no
 * sanitisation to get wrong here because there is no user input.
 */
export function uploadKeyFor(linkId: string, contentType: string): string | null {
  const ext = extensionFor(contentType);
  if (!ext) return null;
  return `${linkId}/${crypto.randomUUID()}.${ext}`;
}

/**
 * The original name, kept for the humans and made harmless first.
 *
 * The same forbidden set OneDrive rejects, plus path separators and dot-runs.
 * This is what ends up in the OneDrive filename; the R2 key never sees it.
 */
export function sanitiseOriginalName(raw: string): string {
  const base = (raw ?? "")
    .split(/[\\/]/).pop() ?? "";           // strip any path Ann's browser sent
  const cleaned = base
    .replace(/\.[A-Za-z0-9]{1,8}$/, "")     // drop her extension; ours is authoritative
    .replace(/["*:<>?/\\|]/g, "-")          // the OneDrive forbidden set
    .replace(/\.+/g, ".")                   // no ".." anywhere, ever
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .replace(/\.+$/, "")
    .trim()
    .slice(0, 80);
  return cleaned.length > 0 ? cleaned : "audio";
}

/**
 * SIGNING A CONTENT-TYPE DOES NOT ENFORCE THE BYTES.
 *
 * A presigned PUT accepts whatever the browser sends; the signed content-type is
 * a hint and nothing more. So the leading bytes are read server-side, after the
 * upload and before anything reaches Dean's drive. This is the check that stops
 * a renamed executable landing in his working folder.
 *
 * Containers, not codecs — enough to establish the file is the kind of thing it
 * claims to be, which is the question being asked.
 */
export function sniffAudio(head: Uint8Array): string | null {
  const a = (s: string, at = 0) =>
    [...s].every((c, i) => head[at + i] === c.charCodeAt(0));

  if (a("RIFF") && a("WAVE", 8)) return "wav";
  if (a("fLaC")) return "flac";
  if (a("ID3")) return "mp3";
  // A bare MPEG frame: 11 sync bits.
  if (head[0] === 0xff && (head[1] & 0xe0) === 0xe0) return "mp3";
  if (a("ftyp", 4)) return "m4a";           // ISO-BMFF, which m4a/mp4 audio is
  return null;
}

/** Whether what was sniffed is compatible with what was signed. */
export function sniffMatches(signedContentType: string, sniffed: string | null): boolean {
  if (!sniffed) return false;
  const expected = extensionFor(signedContentType);
  if (!expected) return false;
  // m4a and mp3 both ride in containers that sniff loosely; everything else is exact.
  return expected === sniffed;
}
