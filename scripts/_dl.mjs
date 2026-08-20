import { createRequire } from "module";
import fs from "fs";
const require = createRequire(import.meta.url);
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/)
  .filter(l => l.includes("=") && !l.trimStart().startsWith("#"))
  .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const client = new S3Client({
  region: "auto",
  endpoint: env.R2_ENDPOINT || `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
});
const obj = await client.send(new GetObjectCommand({ Bucket: env.R2_MEDIA_BUCKET_NAME, Key: process.argv[2] }));
const bytes = await obj.Body.transformToByteArray();
fs.writeFileSync(process.argv[3], Buffer.from(bytes));
console.log(`  downloaded ${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB`);
