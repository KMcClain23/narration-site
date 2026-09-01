/**
 * Cutting a window out of a WAV without decoding it.
 *
 * PURE, AND DELIBERATELY FREE OF ANY RUNTIME API. No Deno, no Node, no fetch —
 * so the byte arithmetic can be unit-tested off a fixture while the Edge
 * Function imports the same module. The arithmetic is where the bugs live; the
 * Range request around it is three lines.
 *
 * ── WHY THIS WORKS AT ALL ──────────────────────────────────────────────────
 *
 * PCM WAV is uncompressed and constant-rate: byte offset IS time, once you know
 * the rate and where the audio starts. So a ten-second window either side of a
 * timestamp is two numbers, and OneDrive will serve exactly those bytes —
 * measured at 1.68 MB out of 126 MB for a real chapter.
 *
 * MP3 IS NOT LIKE THIS and there is no cheap version of it: byte offset does not
 * map to time, frame sync has to be scanned for, and VBR needs the Xing table
 * from the first frame. That is a decoder-shaped problem, and the combined files
 * are standardised as WAV precisely so nobody has to solve it here.
 */

export type WavFormat = {
  /** 1 = PCM. Anything else is not something this can slice safely. */
  format: number;
  channels: number;
  sampleRate: number;
  byteRate: number;
  /** Bytes per frame across all channels. Every offset must land on a multiple. */
  blockAlign: number;
  bits: number;
};

export type WavHeader = WavFormat & {
  /** First byte of audio. NOT 44 in general — see below. */
  dataOffset: number;
  /** Bytes of audio, already clamped to what the file actually holds. */
  dataLength: number;
  durationSeconds: number;
};

export type HeaderFailure =
  /** Read more of the file and try again — the data chunk is further in. */
  | { need: number }
  | { error: string };

export function isHeader(x: WavHeader | HeaderFailure): x is WavHeader {
  return (x as WavHeader).dataOffset !== undefined;
}

const ascii = (b: Uint8Array, at: number, n: number) =>
  String.fromCharCode(...b.subarray(at, at + n));

/**
 * Walk the chunk list to find `fmt ` and `data`.
 *
 * ── THE DATA CHUNK IS NOT AT BYTE 44 ───────────────────────────────────────
 *
 * It is in a canonical file and it was in the spliced chapter measured for this
 * (44, exactly). It was NOT in a raw narrator take from the same drive: that one
 * carried `bext` (602 bytes of broadcast metadata) and `junk` (74 bytes of
 * padding) before the audio, putting `data` at byte 736.
 *
 * A fixed offset would have read 692 bytes of metadata as audio and then been
 * misaligned for the entire rest of the file. That does not fail — it produces
 * noise, which sounds like a bad take rather than like a bug, and a narrator
 * would act on it before anyone worked out what happened. So the list is walked,
 * always, even though today's source happens to be canonical.
 */
export function parseWavHeader(bytes: Uint8Array, fileSize: number): WavHeader | HeaderFailure {
  if (bytes.length < 12) return { need: 4096 };
  if (ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WAVE") {
    return { error: `not a RIFF/WAVE file (starts ${JSON.stringify(ascii(bytes, 0, 4))})` };
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let off = 12;
  let fmt: WavFormat | null = null;

  while (off + 8 <= bytes.length) {
    const id = ascii(bytes, off, 4);
    const size = view.getUint32(off + 4, true);

    if (id === "fmt " && off + 8 + 16 <= bytes.length) {
      fmt = {
        format: view.getUint16(off + 8, true),
        channels: view.getUint16(off + 10, true),
        sampleRate: view.getUint32(off + 12, true),
        byteRate: view.getUint32(off + 16, true),
        blockAlign: view.getUint16(off + 20, true),
        bits: view.getUint16(off + 22, true),
      };
    }

    if (id === "data") {
      if (!fmt) return { error: "data chunk found before fmt" };
      if (fmt.format !== 1) return { error: `not PCM (format ${fmt.format})` };
      if (!fmt.blockAlign || !fmt.byteRate) return { error: "fmt chunk has a zero rate" };

      const dataOffset = off + 8;
      /*
        CLAMPED TO WHAT THE FILE ACTUALLY HOLDS, and the declared length is the
        one to trust when it is smaller.

        Measured on a real take: the declared data length was 45 KB SHORTER than
        the bytes remaining, because chunks follow the audio. Reading to EOF
        would append that metadata to the end of a clip as noise. Taking the
        minimum handles both that and a truncated file.
      */
      const available = Math.max(0, fileSize - dataOffset);
      const dataLength = Math.min(size, available);
      if (dataLength <= 0) return { error: "data chunk is empty" };

      return {
        ...fmt,
        dataOffset,
        dataLength,
        durationSeconds: dataLength / fmt.byteRate,
      };
    }

    // Chunks are word-aligned: an odd size carries a pad byte.
    off += 8 + size + (size % 2);
    if (size > fileSize) return { error: `chunk "${id}" declares an impossible size` };
  }

  // Ran out of buffer before finding `data`. Ask for more rather than guessing.
  return { need: Math.min(Math.max(bytes.length * 4, 16384), 262144) };
}

export type Window =
  | {
      /** Inclusive byte range to Range-request. */
      start: number;
      end: number;
      /** Seconds actually covered, after clamping. */
      fromSeconds: number;
      toSeconds: number;
      clampedStart: boolean;
      clampedEnd: boolean;
    }
  | { pastEnd: true; durationSeconds: number };

/**
 * Byte offsets for ±`pad` seconds around `at`.
 *
 * CLAMPS AT BOTH ENDS, never fails: a pickup at 00:05 cannot go ten seconds back
 * and one near the end cannot go forward, and in both cases a shorter clip is
 * exactly right.
 *
 * PAST THE END IS NOT A CLAMP. If the timestamp is beyond the file's duration,
 * the timestamp and the file disagree about which take is current — clamping
 * would hide that behind a clip of the last ten seconds, which is a plausible
 * wrong answer. It is reported instead.
 */
export function clipWindow(header: WavHeader, at: number, pad: number): Window {
  if (!Number.isFinite(at) || at < 0) return { pastEnd: true, durationSeconds: header.durationSeconds };
  if (at > header.durationSeconds) {
    return { pastEnd: true, durationSeconds: header.durationSeconds };
  }

  const fromSeconds = Math.max(0, at - pad);
  const toSeconds = Math.min(header.durationSeconds, at + pad);

  // Snapped DOWN to a frame boundary at both ends. An offset mid-frame shifts
  // every subsequent sample by a byte and turns the clip into static.
  const snap = (seconds: number) => {
    const raw = Math.round(seconds * header.byteRate);
    return Math.floor(raw / header.blockAlign) * header.blockAlign;
  };

  const startInData = snap(fromSeconds);
  const endInData = Math.min(snap(toSeconds), header.dataLength);
  if (endInData <= startInData) return { pastEnd: true, durationSeconds: header.durationSeconds };

  return {
    start: header.dataOffset + startInData,
    // Range is inclusive on both ends.
    end: header.dataOffset + endInData - 1,
    fromSeconds,
    toSeconds,
    clampedStart: at - pad < 0,
    clampedEnd: at + pad > header.durationSeconds,
  };
}

/**
 * A canonical 44-byte PCM header for a slice that has none of its own.
 *
 * The bytes fetched are raw samples; a player needs a header in front of them.
 * This writes the minimal RIFF/fmt/data form, which every browser reads.
 */
export function wavHeaderFor(fmt: WavFormat, dataLength: number): Uint8Array {
  const out = new Uint8Array(44);
  const view = new DataView(out.buffer);
  const put = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) out[at + i] = s.charCodeAt(i);
  };
  const blockAlign = fmt.channels * (fmt.bits / 8);

  put(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  put(8, "WAVE");
  put(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, fmt.channels, true);
  view.setUint32(24, fmt.sampleRate, true);
  view.setUint32(28, fmt.sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, fmt.bits, true);
  put(36, "data");
  view.setUint32(40, dataLength, true);
  return out;
}

/**
 * 24-bit down to 16-bit, by dropping the low byte of each sample.
 *
 * ── DORMANT FOR TODAY'S SOURCES, AND KEPT ANYWAY ───────────────────────────
 *
 * The spliced chapter files Dean produces are already 16-bit — measured, not
 * assumed: Chapter 23 is PCM, mono, 44,100 Hz, 16-bit, blockAlign 2. So this
 * does nothing on the current path and the recommendation to convert does not
 * apply to it.
 *
 * It stays because the format is DISCOVERED AT RUNTIME rather than promised. The
 * raw narrator takes on the same drive are 24-bit, the folder is one Dean points
 * at by hand, and 24-bit PCM in an <audio> element is not reliably playable.
 * Silently serving something a booth phone cannot play would be the worst
 * outcome here, and this is six lines.
 *
 * Truncation, not dithering: this is a reference clip for identifying a line,
 * not a master.
 */
export function to16Bit(samples: Uint8Array, bits: number): { bytes: Uint8Array; bits: number } {
  if (bits === 16 || bits === 8) return { bytes: samples, bits };
  if (bits !== 24) return { bytes: samples, bits };

  const frames = Math.floor(samples.length / 3);
  const out = new Uint8Array(frames * 2);
  for (let i = 0; i < frames; i++) {
    // Little-endian: bytes 1 and 2 of each 3-byte sample are the high 16 bits.
    out[i * 2] = samples[i * 3 + 1];
    out[i * 2 + 1] = samples[i * 3 + 2];
  }
  return { bytes: out, bits: 16 };
}

/**
 * "12:40" / "01:01.7" / "1:02:11" to seconds.
 *
 * Mirrors what check_pickup_shape admits — and that validator deliberately does
 * NOT cap minutes, because chapters run long: 72:14 is valid and Chapter 23 is
 * nearly 24 minutes. Returns null for anything unparseable rather than a zero,
 * which would cut from the start of the file and look like a working clip.
 */
export function timestampToSeconds(raw: string): number | null {
  /*
    TWO SHAPES, NOT ONE, and the difference is where minutes are bounded.

    With an hour present, minutes are 0-59 like any clock. WITHOUT one, minutes
    run free: "72:14" and "120:00" are ordinary ways to point into a long
    chapter, and check_pickup_shape admits them.

    A single permissive pattern got this wrong: it accepted "1:99:00" as
    9,540 seconds, which the database rejects. A parser more permissive than the
    validator that guards the column will one day be handed a value the column
    cannot hold — or, worse, cut a clip from a timestamp nothing else agrees is
    real.
  */
  const t = (raw ?? "").trim();
  const withHour = /^(\d{1,2}):([0-5]\d):([0-5]\d)(?:\.(\d))?$/.exec(t);
  const m = withHour ?? /^()(\d{1,4}):([0-5]\d)(?:\.(\d))?$/.exec(t);
  if (!m) return null;
  const [, h, mm, ss, tenth] = m;
  return (h ? Number(h) * 3600 : 0) + Number(mm) * 60 + Number(ss) + (tenth ? Number(tenth) / 10 : 0);
}

/**
 * Does this file name hold this chapter?
 *
 * ONE MATCH PROCEEDS; ZERO OR MANY IS A STATED SKIP. Cutting from the wrong
 * chapter is worse than sending no clip, and it is the failure a narrator acts
 * on before noticing.
 *
 * Numeric chapters match on a WHOLE number, so "Chapter 2" never matches
 * "Chapter 20" — with 23 chapters in this one book that is not a hypothetical.
 * Text chapters (Epilogue, Opening Credits) match on the normalised name. The
 * book-title prefix is ignored, because some books carry one and some do not.
 */
export function chapterMatches(fileName: string, chapter: string): boolean {
  const stem = fileName.replace(/\.[a-z0-9]+$/i, "");
  // Apostrophes are REMOVED, not turned into spaces. "Author's Note" and
  // "Authors Note.wav" are the same section and the drive holds the second
  // spelling; splitting on the apostrophe made them "author s note" and
  // "authors note", which match nothing.
  const norm = (s: string) =>
    s.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const nFile = norm(stem);
  const nChap = norm(chapter);
  if (!nChap) return false;

  if (/^\d+$/.test(nChap)) {
    return new RegExp(`(^|\\s)(chapter\\s*)?${nChap}(\\s|$)`).test(nFile);
  }
  return nFile === nChap || nFile.endsWith(` ${nChap}`);
}
