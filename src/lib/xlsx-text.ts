import "server-only";
import zlib from "node:zlib";

// Minimal xlsx reader: an .xlsx is a ZIP of XML parts, and only a handful of
// them matter. Written by hand rather than pulling in a spreadsheet library —
// the app needs the cell text, not formulas, styles, charts or writing.
//
// Verified against a real ACX monthly royalty workbook (13 sheets, shared
// strings, multi-row headers).


/** Reads a ZIP via its central directory (the only reliable entry index). */
function readZip(buf: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();

  // End of Central Directory: scan backwards — the comment field means it
  // isn't at a fixed offset.
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 0xffff; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a zip file (no end-of-central-directory record)");

  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);

  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);

    // The local header repeats the name/extra lengths, and its extra field can
    // differ in length from the central one — always re-read them here.
    const lNameLen = buf.readUInt16LE(localOffset + 26);
    const lExtraLen = buf.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(start, start + compressedSize);

    try {
      out.set(name, method === 0 ? Buffer.from(raw) : zlib.inflateRawSync(raw));
    } catch {
      // A part that won't inflate is skipped rather than failing the file —
      // the sheets we need are usually fine even when an image isn't.
    }

    p += 46 + nameLen + extraLen + commentLen;
  }

  return out;
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, "&");
}

/** Column letters to a zero-based index: A→0, Z→25, AA→26. */
function colIndex(ref: string): number {
  const letters = ref.replace(/\d+/g, "");
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export type SheetText = { name: string; tsv: string; rows: number };

/**
 * Converts a workbook to one tab-separated block per sheet.
 *
 * Blank rows are dropped and trailing empty cells trimmed: royalty workbooks
 * are mostly padding, and the cost of sending it is paid on every request.
 */
export function xlsxToSheets(buffer: Buffer): SheetText[] {
  const zip = readZip(buffer);

  const sharedXml = zip.get("xl/sharedStrings.xml")?.toString("utf8") ?? "";
  const shared: string[] = [];
  for (const si of sharedXml.split("<si>").slice(1)) {
    const body = si.split("</si>")[0];
    let text = "";
    for (const m of body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) text += m[1];
    shared.push(decodeXml(text));
  }

  const relsXml = zip.get("xl/_rels/workbook.xml.rels")?.toString("utf8") ?? "";
  const rel = new Map<string, string>();
  for (const m of relsXml.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)) rel.set(m[1], m[2]);

  const wbXml = zip.get("xl/workbook.xml")?.toString("utf8") ?? "";
  const sheets: SheetText[] = [];

  for (const m of wbXml.matchAll(/<sheet\s+name="([^"]+)"[^>]*r:id="([^"]+)"/g)) {
    const name = decodeXml(m[1]);
    const target = rel.get(m[2]);
    if (!target) continue;

    const key = `xl/${target.replace(/^\/?xl\//, "")}`;
    const xml = zip.get(key)?.toString("utf8");
    if (!xml) continue;

    const lines: string[] = [];
    for (const rowM of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells: string[] = [];
      for (const cM of rowM[1].matchAll(/<c\s+([^>]*?)\/?>(?:([\s\S]*?)<\/c>)?/g)) {
        const attrs = cM[1];
        const inner = cM[2] ?? "";
        const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1];
        const type = /t="([^"]+)"/.exec(attrs)?.[1];

        let v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? "";
        if (type === "s") v = shared[Number(v)] ?? "";
        else if (type === "inlineStr") v = decodeXml(/<t[^>]*>([\s\S]*?)<\/t>/.exec(inner)?.[1] ?? "");
        else v = decodeXml(v);

        if (ref) cells[colIndex(ref)] = v;
      }
      const line = Array.from(cells, c => c ?? "").join("\t").replace(/\t+$/, "");
      if (line.trim()) lines.push(line);
    }

    sheets.push({ name, tsv: lines.join("\n"), rows: lines.length });
  }

  return sheets;
}

/**
 * Sheets worth sending to the model.
 *
 * An ACX monthly workbook has 13 sheets, most of them per-marketplace unit
 * breakdowns and a glossary. The money lives in a few, and sending the rest
 * costs tokens while giving the model more chances to pick the wrong number.
 */
const RELEVANT = [
  "summary",
  "royalties by title",
  "adjustments",
  "bounties",
  "royalt",
  "payment",
  "earnings",
];

export function selectMoneySheets(sheets: SheetText[]): SheetText[] {
  const picked = sheets.filter(
    s => s.rows > 0 && RELEVANT.some(k => s.name.toLowerCase().includes(k)),
  );
  // Nothing matched by name — a non-ACX workbook. Fall back to every
  // non-trivial sheet rather than sending nothing.
  return picked.length > 0 ? picked : sheets.filter(s => s.rows > 1).slice(0, 6);
}
