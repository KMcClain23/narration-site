import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { clientIp, rateLimit } from "@/lib/pickup-link";
import {
  MAX_BYTES,
  MAX_FILES_PER_CONFIRM,
  extensionFor,
  uploadKeyFor,
} from "@/lib/pickup-upload-rules";
import { QUARANTINE_ROOT, createUploadSession, graphAppToken } from "@/lib/pickup-graph";

/**
 * Issue OneDrive upload sessions for a narrator's audio, into QUARANTINE.
 *
 * EVERY LIMIT IS ENFORCED HERE, not in the browser — an attacker does not run
 * the browser's copy. Refusing to create the session is the only enforcement
 * that exists, because once a session URL is out the upload cannot be stopped:
 *
 *   - the token must be live (an expired or revoked one gets no URL at all)
 *   - at most 5 files per request, and a running per-token total on top
 *   - at most 200 MB each
 *   - the content type must be on the allowlist
 *
 * The destination is server-chosen: Pickups/_incoming/{link_id}/{uuid}.{ext}.
 * The narrator's filename never reaches a path.
 *
 * The URL returned is bound to that ONE path, is short-lived and is write-only.
 * That is the same shape as a presigned PUT — not drive-wide access — which is
 * why it is safe to hand to a browser. What it does NOT do is let us check the
 * bytes before they arrive, and the quarantine folder is what covers that.
 */
export async function POST(req: Request) {
  const ip = clientIp(req.headers);
  if (!(await rateLimit(ip, "sign", 20, 60))) {
    return NextResponse.json({ error: "Too many attempts. Wait a minute." }, { status: 429 });
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

  const linkIdRes = await supabaseAdmin.rpc("pickup_link_id_by_token", { p_token: token });
  const linkId = linkIdRes.data as string | null;
  if (!linkId) {
    return NextResponse.json({ error: "That link is no longer valid." }, { status: 403 });
  }

  const { data: already } = await supabaseAdmin.rpc("pickup_upload_count", { p_token: token });
  const used = (already as number) ?? 0;
  if (used + files.length > MAX_FILES_PER_CONFIRM) {
    return NextResponse.json(
      { error: `This link has reached its limit of ${MAX_FILES_PER_CONFIRM} files.`, used },
      { status: 429 },
    );
  }

  // Validate EVERY file before creating ANY session, so a refused batch leaves
  // no half-open sessions behind.
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
  }

  let graph: string;
  try {
    graph = await graphAppToken();
  } catch (e) {
    console.error("upload session unavailable:", (e as Error).message);
    return NextResponse.json(
      { error: "Uploads are not available right now. Send your audio the usual way." },
      { status: 503 },
    );
  }

  const out: { path: string; url: string; name: string }[] = [];
  for (const f of files) {
    const contentType = String(f.contentType ?? "");
    // The same server-naming helper as before, minus the R2 prefix. The
    // guarantee is unchanged: nothing from the filename reaches the path.
    const path = `${QUARANTINE_ROOT}/${uploadKeyFor(linkId, contentType)!}`;
    try {
      out.push({ path, url: await createUploadSession(graph, path), name: String(f.name ?? "") });
    } catch (e) {
      console.error("createUploadSession failed:", (e as Error).message);
      return NextResponse.json({ error: "Could not start the upload." }, { status: 502 });
    }
  }

  return NextResponse.json({ files: out });
}
