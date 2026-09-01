/**
 * The clip arithmetic, tested off fixtures.
 *
 * These are the numbers that decide which twenty seconds a narrator hears. A
 * window that is the right LENGTH from the wrong OFFSET passes every check that
 * only looks at sizes and statuses, so the offsets are asserted against values
 * worked out by hand from the measured header of the real file:
 *
 *   Spliced/A Cowboy's Runaway/Chapter 23.wav
 *   PCM · mono · 44,100 Hz · 16-bit · blockAlign 2 · byteRate 88,200
 *   data at byte 44, declared length 126,931,368 → 23:59
 *
 * Run: npm run test:wav
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chapterMatches, clipWindow, isHeader, parseWavHeader, timestampToSeconds,
  to16Bit, wavHeaderFor,
} from "../supabase/functions/send-pickups/wav.ts";

/** Build a WAV header in front of `dataLen` bytes, with optional extra chunks. */
function fixture({ bits = 16, channels = 1, rate = 44100, dataLen = 88200, extra = [] } = {}) {
  const blockAlign = channels * (bits / 8);
  const chunks = [];
  for (const [id, size] of extra) {
    const c = new Uint8Array(8 + size);
    for (let i = 0; i < 4; i++) c[i] = id.charCodeAt(i);
    new DataView(c.buffer).setUint32(4, size, true);
    chunks.push(c);
  }
  const extraLen = chunks.reduce((n, c) => n + c.length, 0);
  const head = new Uint8Array(12 + 24 + extraLen + 8);
  const view = new DataView(head.buffer);
  const put = (at, s) => { for (let i = 0; i < s.length; i++) head[at + i] = s.charCodeAt(i); };
  put(0, "RIFF"); view.setUint32(4, 36 + dataLen, true); put(8, "WAVE");
  put(12, "fmt "); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, channels, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * blockAlign, true);
  view.setUint16(32, blockAlign, true); view.setUint16(34, bits, true);
  let at = 36;
  for (const c of chunks) { head.set(c, at); at += c.length; }
  put(at, "data"); view.setUint32(at + 4, dataLen, true);
  return { bytes: head, dataOffset: at + 8, dataLen };
}

// ── the header walk ───────────────────────────────────────────────────────
test("a canonical file puts data at 44 — the real Chapter 23 shape", () => {
  const f = fixture({ dataLen: 126_931_368 });
  const h = parseWavHeader(f.bytes, f.dataOffset + f.dataLen);
  assert.ok(isHeader(h));
  assert.equal(h.dataOffset, 44);
  assert.equal(h.bits, 16);
  assert.equal(h.byteRate, 88_200);
  assert.equal(Math.round(h.durationSeconds), 1439); // 23:59
});

test("bext and junk chunks push data past 44 — the raw-take shape", () => {
  // The offsets measured on a narrator take: bext 602, junk 74, data at 736.
  const f = fixture({ bits: 24, extra: [["bext", 602], ["junk", 74]] });
  const h = parseWavHeader(f.bytes, f.dataOffset + f.dataLen);
  assert.ok(isHeader(h));
  assert.equal(h.dataOffset, 736);
  assert.equal(h.bits, 24);
});

test("data further in than the first read asks for more rather than guessing", () => {
  const f = fixture({ extra: [["junk", 40000]] });
  const short = f.bytes.subarray(0, 4096);
  const r = parseWavHeader(short, f.dataOffset + f.dataLen);
  assert.ok(!isHeader(r) && "need" in r, "must ask for more bytes");
  // And succeeds once given them — otherwise "need" would just be a dead end.
  const full = parseWavHeader(f.bytes, f.dataOffset + f.dataLen);
  assert.ok(isHeader(full));
  assert.equal(full.dataOffset, f.dataOffset);
});

test("declared data length wins when the file holds more — trailing chunks", () => {
  const f = fixture({ dataLen: 88200 });
  // 45 KB of trailing metadata, exactly the shape measured on the real take.
  const h = parseWavHeader(f.bytes, f.dataOffset + 88200 + 45000);
  assert.ok(isHeader(h));
  assert.equal(h.dataLength, 88200, "must not read the trailing chunks as audio");
});

test("a truncated file is clamped to what is actually there", () => {
  const f = fixture({ dataLen: 88200 });
  const h = parseWavHeader(f.bytes, f.dataOffset + 40000);
  assert.ok(isHeader(h));
  assert.equal(h.dataLength, 40000);
});

test("non-PCM and non-RIFF are refused, not sliced", () => {
  const bad = new Uint8Array(64);
  assert.ok("error" in parseWavHeader(bad, 64));
  const f = fixture();
  new DataView(f.bytes.buffer).setUint16(20, 3, true); // IEEE float
  const r = parseWavHeader(f.bytes, f.dataOffset + f.dataLen);
  assert.ok("error" in r && /not PCM/.test(r.error));
});

// ── the window ────────────────────────────────────────────────────────────
const real = () => {
  const f = fixture({ dataLen: 126_931_368 });
  const h = parseWavHeader(f.bytes, f.dataOffset + f.dataLen);
  assert.ok(isHeader(h));
  return h;
};

test("a mid-file window is exactly the arithmetic, by hand", () => {
  const h = real();
  // 12:40 = 760s. 750s * 88,200 = 66,150,000, + 44 = 66,150,044.
  const w = clipWindow(h, 760, 10);
  assert.ok(!("pastEnd" in w));
  assert.equal(w.start, 66_150_044);
  assert.equal(w.end, 44 + 770 * 88_200 - 1);
  assert.equal(w.end - w.start + 1, 20 * 88_200, "20 seconds of audio");
  assert.equal(w.clampedStart, false);
  assert.equal(w.clampedEnd, false);
});

test("the start clamps, and the clip is shorter rather than failing", () => {
  const h = real();
  const w = clipWindow(h, 4, 10); // 00:04 — cannot go ten seconds back
  assert.ok(!("pastEnd" in w));
  assert.equal(w.start, 44, "starts at the first audio byte");
  assert.equal(w.fromSeconds, 0);
  assert.equal(w.clampedStart, true);
  assert.equal(w.end - w.start + 1, 14 * 88_200);
});

test("the end clamps too", () => {
  const h = real();
  const w = clipWindow(h, h.durationSeconds - 3, 10);
  assert.ok(!("pastEnd" in w));
  assert.equal(w.clampedEnd, true);
  assert.ok(w.end < 44 + h.dataLength, "never reads past the declared audio");
});

test("past the end REPORTS rather than clamping", () => {
  const h = real();
  const w = clipWindow(h, h.durationSeconds + 30, 10);
  assert.ok("pastEnd" in w, "a timestamp beyond the file is a finding, not a clip");
});

test("every offset lands on a frame boundary", () => {
  const h = parseWavHeader(...(() => { const f = fixture({ bits: 24, channels: 2 }); return [f.bytes, f.dataOffset + f.dataLen]; })());
  assert.ok(isHeader(h));
  assert.equal(h.blockAlign, 6);
  for (const at of [0.31, 1.7, 0.05, 0.9]) {
    const w = clipWindow(h, at, 0.2);
    if ("pastEnd" in w) continue;
    assert.equal((w.start - h.dataOffset) % h.blockAlign, 0, `start off-frame at ${at}`);
    assert.equal((w.end + 1 - h.dataOffset) % h.blockAlign, 0, `end off-frame at ${at}`);
  }
});

// ── header synthesis and bit depth ────────────────────────────────────────
test("the synthesized header round-trips through the parser", () => {
  const fmt = { format: 1, channels: 1, sampleRate: 44100, byteRate: 88200, blockAlign: 2, bits: 16 };
  const head = wavHeaderFor(fmt, 1_764_000);
  const joined = new Uint8Array(head.length + 16);
  joined.set(head);
  const h = parseWavHeader(joined, head.length + 1_764_000);
  assert.ok(isHeader(h));
  assert.equal(h.sampleRate, 44100);
  assert.equal(h.bits, 16);
  assert.equal(h.dataOffset, 44);
});

test("16-bit passes through untouched — today's spliced files", () => {
  const s = new Uint8Array([1, 2, 3, 4]);
  const r = to16Bit(s, 16);
  assert.equal(r.bits, 16);
  assert.equal(r.bytes, s, "must not copy when there is nothing to do");
});

test("24-bit drops the low byte of each sample", () => {
  // Two little-endian samples: 0x030201 and 0x060504.
  const s = new Uint8Array([1, 2, 3, 4, 5, 6]);
  const r = to16Bit(s, 24);
  assert.equal(r.bits, 16);
  assert.deepEqual([...r.bytes], [2, 3, 5, 6]);
});

// ── timestamps ────────────────────────────────────────────────────────────
test("timestamps parse the way the trigger validates them", () => {
  assert.equal(timestampToSeconds("12:40"), 760);
  assert.equal(timestampToSeconds("01:01.7"), 61.7);
  assert.equal(timestampToSeconds("20:06"), 1206);
  assert.equal(timestampToSeconds("23:34"), 1414);
  assert.equal(timestampToSeconds("1:02:11"), 3731);
  // Minutes are NOT capped — chapters run long, and the trigger admits these.
  assert.equal(timestampToSeconds("72:14"), 4334);
  assert.equal(timestampToSeconds("120:00"), 7200);
});

test("an unparseable timestamp is null, never zero", () => {
  // Zero would cut the opening of the chapter and look like a working clip.
  for (const bad of ["", "abc", "12", "12:60", "1:99:00", "--"]) {
    assert.equal(timestampToSeconds(bad), null, `${bad} must not parse`);
  }
});

// ── chapter matching ──────────────────────────────────────────────────────
test("Chapter 2 never matches Chapter 20", () => {
  assert.equal(chapterMatches("Chapter 2.wav", "2"), true);
  assert.equal(chapterMatches("Chapter 20.wav", "2"), false);
  assert.equal(chapterMatches("Chapter 23.wav", "23"), true);
  assert.equal(chapterMatches("Chapter 2.wav", "23"), false);
});

test("a title prefix is ignored, because some books carry one", () => {
  assert.equal(chapterMatches("Unmasked Hearts Chapter 17.mp3", "17"), true);
  assert.equal(chapterMatches("Chapter 17.wav", "17"), true);
});

test("named sections match on the name", () => {
  assert.equal(chapterMatches("Epilogue.wav", "Epilogue"), true);
  assert.equal(chapterMatches("Opening Credits.mp3", "Opening Credits"), true);
  assert.equal(chapterMatches("Authors Note.wav", "Author's Note"), true);
  assert.equal(chapterMatches("Dedication.wav", "Epilogue"), false);
});

test("exactly one file matches chapter 23 in the real folder listing", () => {
  // The names actually present in Spliced/A Cowboy's Runaway today, plus the
  // siblings that will land beside them as more chapters are spliced.
  const folder = ["Chapter 2.wav", "Chapter 3.wav", "Chapter 20.wav", "Chapter 23.wav", "Epilogue.wav"];
  assert.deepEqual(folder.filter(f => chapterMatches(f, "23")), ["Chapter 23.wav"]);
  assert.deepEqual(folder.filter(f => chapterMatches(f, "3")), ["Chapter 3.wav"]);
  assert.deepEqual(folder.filter(f => chapterMatches(f, "99")), []);
});
