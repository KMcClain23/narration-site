import { createRequire } from "module";
import fs from "fs";
const require = createRequire(import.meta.url);
const { S3Client, HeadObjectCommand } = require("@aws-sdk/client-s3");

const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/)
  .filter(l => l.includes("=") && !l.trimStart().startsWith("#"))
  .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));

const client = new S3Client({
  region: "auto",
  endpoint: env.R2_ENDPOINT || `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
});
const bucket = env.R2_MEDIA_BUCKET_NAME;
console.log("  bucket: " + bucket);
const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: process.argv[2] }));
console.log(`  size: ${(head.ContentLength / 1024 / 1024).toFixed(1)} MB`);
console.log(`  type: ${head.ContentType}`);
