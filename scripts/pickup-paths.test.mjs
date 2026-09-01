/**
 * The two path modules must agree, character for character.
 *
 * They exist twice because `supabase/functions` is Deno code excluded from
 * tsconfig, and the Supabase CLI only uploads files beside the function's entry
 * point — so one shared module is not available across that boundary.
 *
 * A COMMENT ASKING SOMEBODY TO KEEP THEM IN STEP IS NOT ENOUGH. The slug
 * function had exactly that comment, in the file that most needed it, and four
 * copies drifted anyway — one of them into a different algorithm. This is the
 * same constraint made checkable: edit one side and a named input goes red.
 *
 * Run: npm run test:paths
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import * as web from "../src/lib/pickup-paths.ts";
import * as webWav from "../src/lib/wav.ts";
import * as edge from "../supabase/functions/send-pickups/paths.ts";

/**
 * Every chapter string in the live data, plus the shapes the free-text field
 * permits that nobody has typed yet.
 */
const CHAPTERS = [
  "5", "6", "11", "20", "21", "22", "23",          // live today
  "1", "12.5",                                      // interstitial
  "Prologue", "Epilogue", "Opening Credits", "Closing Credits",
  "Author's Note", "Dedication", "Trigger Warnings",
  "  23  ", "", "  ", "23/24", "Chapter 23",        // whitespace and hostile
  "a:b*c?d", "trailing...",
];

const NAMES = [
  "Closing Credits", "take 1", "A Cowboy's Runaway", "", "  ",
  'weird"chars*here', "dots...", "a/b\\c",
];

const TIMESTAMPS = ["12:40", "01:01.7", "00:04", "1:02:11", "23:34", ""];

test("sanitiseSegment agrees on every input", () => {
  for (const s of [...CHAPTERS, ...NAMES, ...TIMESTAMPS]) {
    assert.equal(edge.sanitiseSegment(s), web.sanitiseSegment(s), `sanitiseSegment(${JSON.stringify(s)})`);
  }
});

test("chapterFolder agrees on every chapter", () => {
  for (const c of CHAPTERS) {
    assert.equal(edge.chapterFolder(c), web.chapterFolder(c), `chapterFolder(${JSON.stringify(c)})`);
  }
});

test("chapterDir agrees", () => {
  for (const c of CHAPTERS) {
    for (const n of ["Dean", "Ann Dahlia", "Cricket The Narrator"]) {
      assert.equal(
        edge.chapterDir("A Cowboy's Runaway", n, c),
        web.chapterDir("A Cowboy's Runaway", n, c),
        `chapterDir(${JSON.stringify(n)}, ${JSON.stringify(c)})`,
      );
    }
  }
});

test("clipName and takeName agree", () => {
  for (const t of TIMESTAMPS) {
    assert.equal(edge.clipName(t), web.clipName(t), `clipName(${JSON.stringify(t)})`);
  }
  for (const n of NAMES) {
    for (const e of ["wav", "mp3", ".MP3", ""]) {
      assert.equal(edge.takeName(n, e), web.takeName(n, e), `takeName(${JSON.stringify(n)}, ${JSON.stringify(e)})`);
    }
  }
  assert.equal(edge.manifestName(), web.manifestName());
});

// ── and the rules themselves, not just that the copies match ───────────────
//
// Two identical WRONG implementations agree perfectly, so the parity tests
// above cannot be the only ones.

test("a numeric chapter gets the word, a named one does not", () => {
  assert.equal(web.chapterFolder("23"), "Chapter 23");
  assert.equal(web.chapterFolder("5"), "Chapter 5");
  assert.equal(web.chapterFolder("12.5"), "Chapter 12.5");
  assert.equal(web.chapterFolder("Prologue"), "Prologue");
  assert.equal(web.chapterFolder("Opening Credits"), "Opening Credits");
  // "Chapter Prologue" would be wrong, and the free-text field exists so that
  // named sections can be named.
  assert.ok(!web.chapterFolder("Prologue").startsWith("Chapter"));
});

test("a chapter folder is never empty and never contains a separator", () => {
  for (const c of CHAPTERS) {
    const f = web.chapterFolder(c);
    assert.ok(f.length > 0, `empty folder for ${JSON.stringify(c)}`);
    assert.ok(!f.includes("/") && !f.includes("\\"), `separator in ${JSON.stringify(f)}`);
  }
  // An empty chapter must not silently reparent the files one level up.
  assert.equal(web.chapterFolder(""), "Untitled");
  assert.equal(web.chapterFolder("   "), "Untitled");
});

test("the three kinds are distinguishable by prefix alone", () => {
  const dir = web.chapterDir("A Cowboy's Runaway", "Dean", "23");
  assert.equal(dir, "Pickups/A Cowboy's Runaway/Dean/Chapter 23");
  assert.equal(web.manifestName(), "pickups.txt");
  assert.equal(web.clipName("12:40"), "clip 12-40.wav");
  assert.equal(web.takeName("Closing Credits", "mp3"), "take - Closing Credits.mp3");
  // Sorted, they group by kind, which is the whole reason for prefixes rather
  // than clips/ and takes/ subfolders.
  const sorted = [web.manifestName(), web.clipName("12:40"), web.takeName("Closing Credits", "mp3")].sort();
  assert.deepEqual(sorted, ["clip 12-40.wav", "pickups.txt", "take - Closing Credits.mp3"]);
});

test("a colon in a timestamp cannot create a path separator", () => {
  // ":" is illegal in a OneDrive name and would break the URL if it survived.
  assert.ok(!web.clipName("1:02:11").includes(":"));
  assert.equal(web.clipName("1:02:11"), "clip 1-02-11.wav");
});

// ── the gate's copies of the matcher must agree too ───────────────────────
//
// The Edge Function gates the send and needs chapterMatches + isAudioFile, but
// the cutter (and its originals) now live on the Next side. Same runtime
// boundary, same answer: twins, pinned.
test("isAudioFile agrees across the boundary", () => {
  for (const f of [
    "Chapter 5.wav", "Chapter 5.WAV", "x.mp3", "y.M4A", "z.flac",
    "desktop.ini", "Thumbs.db", "notes.txt", "Chapter 5", "cover.jpg", "",
  ]) {
    assert.equal(edge.isAudioFile(f), webWav.isAudioFile(f), `isAudioFile(${JSON.stringify(f)})`);
  }
});

test("chapterMatches agrees across the boundary", () => {
  const files = [
    "Chapter 5.wav", "Chapter 20.wav", "Chapter 2.wav", "Chapter 23.wav",
    "Unmasked Hearts Chapter 17.mp3", "Epilogue.wav", "Authors Note.wav",
    "Opening Credits.mp3", "desktop.ini",
  ];
  for (const f of files) {
    for (const c of CHAPTERS) {
      assert.equal(
        edge.chapterMatches(f, c), webWav.chapterMatches(f, c),
        `chapterMatches(${JSON.stringify(f)}, ${JSON.stringify(c)})`,
      );
    }
  }
});
