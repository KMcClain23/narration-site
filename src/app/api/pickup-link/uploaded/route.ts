import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { clientIp, rateLimit } from "@/lib/pickup-link";
import { MAX_BYTES, sanitiseOriginalName, sniffAudio, sniffMatches } from "@/lib/pickup-upload-rules";
import { QUARANTINE_ROOT, deleteByPath, graphAppToken, itemByPath, readHead } from "@/lib/pickup-graph";

/**
 * The bytes are in quarantine. Decide whether they may go any further.
 *
 * THIS IS WHERE THE CONTENT TYPE IS ACTUALLY ENFORCED. An upload session URL
 * accepts whatever the browser sends it — the type declared at session creation
 * is a claim about a file that had not been uploaded yet, and nothing about the
 * session inspects a byte. So the first bytes are read back from OneDrive and
 * sniffed, and a mismatch is DELETED from quarantine.
 *
 * That check happening AFTER arrival rather than before is the one property lost
 * by dropping the R2 hop, and `Pickups/_incoming/` is what pays for it: nothing
 * unverified is ever in the working folders, and the sweep only ever moves files
 * that passed this.
 *
 * The row is created BEFORE the check so a rejection has somewhere to be
 * recorded. A rejected row keeps `rejected_reason` and is terminal — it is not a
 * retry, and faking that by exhausting `attempts` would make "this is not audio"
 * indistinguishable from "Graph was down".
 */
export async function POST(req: Request) {
  const ip = clientIp(req.headers);
  if (!(await rateLimit(ip, "uploaded", 20, 60))) {
    return NextResponse.json({ error: "Too many attempts. Wait a minute." }, { status: 429 });
  }

  let token: string;
  let files: { path: string; name: string; contentType: string }[];
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

  let graph: string;
  try {
    graph = await graphAppToken();
  } catch {
    return NextResponse.json({ error: "Uploads are not available right now." }, { status: 503 });
  }

  const accepted: { name: string; bytes: number }[] = [];
  const rejected: { name: string; reason: string }[] = [];

  for (const f of files) {
    const path = String(f.path ?? "");
    const contentType = String(f.contentType ?? "");
    const shown = sanitiseOriginalName(String(f.name ?? ""));

    // THE PATH CAME BACK FROM THE BROWSER, so it is untrusted. A path outside
    // this link's own quarantine folder would let one narrator claim another's
    // upload.
    if (!path.startsWith(`${QUARANTINE_ROOT}/${linkId}/`)) {
      rejected.push({ name: shown, reason: "not a destination issued for this link" });
      continue;
    }

    try {
      const item = await itemByPath(graph, path);
      if (!item) {
        rejected.push({ name: shown, reason: "the upload did not finish" });
        continue;
      }
      if (item.size <= 0 || item.size > MAX_BYTES) {
        await deleteByPath(graph, path);
        rejected.push({ name: shown, reason: "wrong size" });
        continue;
      }

      const { data: rowId, error } = await supabaseAdmin.rpc("record_pickup_upload", {
        p_token: token,
        p_quarantine_path: path,
        p_original_name: shown,
        p_content_type: contentType,
        p_bytes: item.size,
      });
      if (error) {
        await deleteByPath(graph, path);
        rejected.push({ name: shown, reason: "could not be recorded" });
        continue;
      }

      // Read back and sniff. A range read, not a download — enough to identify a
      // container, which is the question being asked.
      const head = await readHead(graph, path);
      const sniffed = sniffAudio(head);
      if (!sniffMatches(contentType, sniffed)) {
        const reason = sniffed
          ? `looks like ${sniffed}, not ${contentType}`
          : "is not an audio file we recognise";
        await deleteByPath(graph, path);
        await supabaseAdmin.rpc("mark_upload_rejected", { p_id: rowId, p_reason: reason });
        rejected.push({ name: shown, reason });
        continue;
      }

      accepted.push({ name: shown, bytes: item.size });
    } catch (e) {
      console.error("upload check failed:", (e as Error).message);
      rejected.push({ name: shown, reason: "could not be read back" });
    }
  }

  return NextResponse.json({ accepted, rejected });
}
