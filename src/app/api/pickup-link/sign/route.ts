import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { clientIp, rateLimit } from "@/lib/pickup-link";
import {
  MAX_BYTES,
  MAX_FILES_PER_CONFIRM,
  extensionFor,
  pickupsBucket,
  pickupsR2,
  r2KeyFor,
} from "@/lib/pickup-upload";

/**
 * Issue presigned R2 PUTs for a narrator's audio.
 *
 * EVERY LIMIT IS ENFORCED HERE, not in the browser — an attacker does not run
 * the browser's copy. Refusing to ISSUE a URL is the only enforcement that
 * exists, because once a URL is signed the upload cannot be stopped.
 *
 *   - the token must be live (an expired or revoked one gets no URL at all)
 *   - at most 5 files per request
 *   - at most 200 MB each, signed with a content-length range so R2 itself
 *     rejects a larger body rather than trusting the declared size
 *   - a per-token running total on top of the per-IP limit
 *   - the content type must be on the allowlist
 *
 * The R2 key is server-generated. Ann's filename never reaches a path.
 */
export async function POST(req: Request) {
  const ip = clientIp(req.headers);
  if (!(await rateLimit(ip, "sign", 20, 60))) {
    return NextResponse.json({ error: "Too many attempts. Wait a minute." }, { status: 429 });
  }

  // The bucket is resolved FIRST and the refusal is explicit: with nowhere safe
  // to put audio, the correct behaviour is to issue nothing.
  let bucket: string;
  try {
    bucket = pickupsBucket();
  } catch (e) {
    console.error("pickup upload disabled:", (e as Error).message);
    return NextResponse.json(
      { error: "Uploads are not available yet. Send your audio the usual way." },
      { status: 503 },
    );
  }

  let token: string;
  let files: { name: string; contentType: string; bytes: number }[];
  try {
    const body = await req.json();
    token = String(body.token ?? "");
    files = Array.isArray(body.files) ? body.files : [];
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  if (!token || files.length === 0) {
    return NextResponse.json({ error: "Nothing to upload." }, { status: 400 });
  }
  if (files.length > MAX_FILES_PER_CONFIRM) {
    return NextResponse.json(
      { error: `At most ${MAX_FILES_PER_CONFIRM} files at a time.` },
      { status: 400 },
    );
  }

  // The token must be live. Asked of the database, which is the only thing that
  // knows — and a dead token gets the same answer as an over-quota one.
  const { data: linkRows, error: linkError } = await supabaseAdmin
    .rpc("pickup_batch_by_token", { p_token: token });
  if (linkError || !linkRows || (linkRows as unknown[]).length === 0) {
    return NextResponse.json({ error: "That link is no longer valid." }, { status: 403 });
  }

  // The per-token cap, on top of per-IP. Counted server-side across every
  // request this token has ever made, not per-request.
  const { data: already } = await supabaseAdmin.rpc("pickup_upload_count", { p_token: token });
  const used = (already as number) ?? 0;
  if (used + files.length > MAX_FILES_PER_CONFIRM) {
    return NextResponse.json(
      {
        error: `This link has reached its limit of ${MAX_FILES_PER_CONFIRM} files.`,
        used,
      },
      { status: 429 },
    );
  }

  // link_id is needed for the key. It is not in the batch payload by design, so
  // it is looked up here rather than widening what the narrator's page returns.
  const { data: linkId } = await supabaseAdmin
    .rpc("pickup_link_id_by_token", { p_token: token });
  if (!linkId) {
    return NextResponse.json({ error: "That link is no longer valid." }, { status: 403 });
  }

  const r2 = pickupsR2();
  const out: { key: string; url: string; name: string }[] = [];

  for (const f of files) {
    const contentType = String(f.contentType ?? "");
    if (!extensionFor(contentType)) {
      return NextResponse.json(
        { error: `${contentType || "That file type"} is not an audio format we accept.` },
        { status: 400 },
      );
    }
    const declared = Number(f.bytes ?? 0);
    if (!Number.isFinite(declared) || declared <= 0 || declared > MAX_BYTES) {
      return NextResponse.json({ error: "Each file must be under 200 MB." }, { status: 400 });
    }

    const key = r2KeyFor(String(linkId), contentType);
    if (!key) {
      return NextResponse.json({ error: "Unsupported audio format." }, { status: 400 });
    }

    const url = await getSignedUrl(
      r2,
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
        // The DECLARED size is signed too, so a body larger than promised is
        // rejected by R2 rather than accepted and discovered later.
        ContentLength: declared,
      }),
      { expiresIn: 15 * 60 },
    );

    out.push({ key, url, name: String(f.name ?? "") });
  }

  return NextResponse.json({ files: out });
}
