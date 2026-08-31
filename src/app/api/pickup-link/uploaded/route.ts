import { NextResponse } from "next/server";
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { clientIp, rateLimit } from "@/lib/pickup-link";
import {
  MAX_BYTES,
  pickupsBucket,
  pickupsR2,
  sanitiseOriginalName,
  sniffAudio,
  sniffMatches,
} from "@/lib/pickup-upload";

/**
 * The bytes have landed in R2. Decide whether they may go any further.
 *
 * THIS IS WHERE THE CONTENT TYPE IS ACTUALLY ENFORCED. A presigned PUT accepts
 * whatever the browser sends — the signed content-type is a claim the client
 * made about a file it had not uploaded yet, and nothing about the signature
 * inspects a single byte. So the file is read back here, its leading bytes are
 * sniffed, and a mismatch is DELETED from R2 and never recorded.
 *
 * That ordering matters: the object exists for a moment either way, but nothing
 * unverified is ever visible to the sweep that files into Dean's drive.
 *
 * Recording the row is the LAST thing. An upload that fails the sniff leaves no
 * row, so `pending_pickup_uploads` can only ever hand the sweep files that were
 * checked.
 */
export async function POST(req: Request) {
  const ip = clientIp(req.headers);
  if (!(await rateLimit(ip, "uploaded", 20, 60))) {
    return NextResponse.json({ error: "Too many attempts. Wait a minute." }, { status: 429 });
  }

  let bucket: string;
  try {
    bucket = pickupsBucket();
  } catch {
    return NextResponse.json({ error: "Uploads are not available." }, { status: 503 });
  }

  let token: string;
  let files: { key: string; name: string; contentType: string }[];
  try {
    const body = await req.json();
    token = String(body.token ?? "");
    files = Array.isArray(body.files) ? body.files : [];
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  if (!token || files.length === 0) {
    return NextResponse.json({ error: "Nothing to record." }, { status: 400 });
  }

  const linkIdRes = await supabaseAdmin.rpc("pickup_link_id_by_token", { p_token: token });
  const linkId = linkIdRes.data as string | null;
  if (!linkId) {
    return NextResponse.json({ error: "That link is no longer valid." }, { status: 403 });
  }

  const r2 = pickupsR2();
  const accepted: { name: string; bytes: number }[] = [];
  const rejected: { name: string; reason: string }[] = [];

  for (const f of files) {
    const key = String(f.key ?? "");
    const contentType = String(f.contentType ?? "");

    // THE KEY MUST BE ONE WE ISSUED. It came back from the browser, so it is
    // untrusted: a key outside this link's prefix would let one narrator record
    // an object belonging to another.
    if (!key.startsWith(`pickups/${linkId}/`)) {
      rejected.push({ name: f.name ?? key, reason: "not a key issued for this link" });
      continue;
    }

    try {
      const head = await r2.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      const size = Number(head.ContentLength ?? 0);
      if (size <= 0 || size > MAX_BYTES) {
        await r2.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
        rejected.push({ name: f.name ?? key, reason: "wrong size" });
        continue;
      }

      // Just the head of the file — enough to identify a container, and it
      // avoids pulling 200 MB through this route to answer a 12-byte question.
      const obj = await r2.send(
        new GetObjectCommand({ Bucket: bucket, Key: key, Range: "bytes=0-63" }),
      );
      const bytes = await obj.Body!.transformToByteArray();
      const sniffed = sniffAudio(bytes);

      if (!sniffMatches(contentType, sniffed)) {
        await r2.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
        rejected.push({
          name: f.name ?? key,
          reason: sniffed
            ? `looks like ${sniffed}, not ${contentType}`
            : "is not an audio file we recognise",
        });
        continue;
      }

      const { error } = await supabaseAdmin.rpc("record_pickup_upload", {
        p_token: token,
        p_r2_key: key,
        p_original_name: sanitiseOriginalName(String(f.name ?? "")),
        p_content_type: contentType,
        p_bytes: size,
      });
      if (error) {
        rejected.push({ name: f.name ?? key, reason: "could not be recorded" });
        continue;
      }
      accepted.push({ name: sanitiseOriginalName(String(f.name ?? "")), bytes: size });
    } catch (e) {
      console.error("upload check failed:", (e as Error).message);
      rejected.push({ name: f.name ?? key, reason: "could not be read back" });
    }
  }

  return NextResponse.json({ accepted, rejected });
}
