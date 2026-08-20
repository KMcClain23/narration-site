import fs from "fs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
if (typeof globalThis.DOMMatrix === "undefined") globalThis.DOMMatrix = class { constructor() {} };

const buf = fs.readFileSync(process.argv[2]);
const before = process.memoryUsage().heapUsed;
const t0 = Date.now();
const out = await require("pdf-parse")(buf);
const t1 = Date.now();
const peak = process.memoryUsage();

const text = out.text || "";
console.log(`  pages            ${out.numpages}`);
console.log(`  words            ${text.trim().split(/\s+/).length.toLocaleString()}`);
console.log(`  pdf-parse took   ${((t1 - t0) / 1000).toFixed(1)}s`);
console.log(`  heap used        ${((peak.heapUsed - before) / 1024 / 1024).toFixed(0)} MB`);
console.log(`  rss              ${(peak.rss / 1024 / 1024).toFixed(0)} MB`);
console.log("\n  first 200 chars: " + text.slice(0, 200).replace(/\n/g, " "));
