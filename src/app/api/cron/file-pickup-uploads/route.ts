import { NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { pickupsBucket, pickupsR2 } from "@/lib/pickup-upload";

/**
 * Move uploaded audio from R2 into Dean's OneDrive. Out of band, on a cron.
 *
 * ── WHY THIS IS NOT PART OF ANN'S REQUEST ──────────────────────────────────
 *
 * Her upload landing in R2 IS the delivery. Filing is internal plumbing, and
 * coupling the two would tell her the upload failed when it did not — she would
 * try again, and Dean would get the same take twice.
 *
 * This is the same deliberate asymmetry as steps 4 and 5 of send-pickups: a
 * failed email must leave everything DRAFT, and a failed manifest must leave
 * everything SENT. Same shape here — a failed file move must leave the upload
 * RECORDED, visible, and retryable, never rolled back.
 *
 * A failure records `attempts` and `last_error` rather than dropping the row, so
 * a stuck file is something you can look at rather than something that is simply
 * absent.
 */

/** The forbidden set, exactly as the manifest already solves it. Two book titles contain colons. */
function sanitiseSegment(raw: string): string {
  const cleaned = (raw ?? "")
    .replace(/["*:<>?/\\|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.+$/, "")
    .trim();
  return cleaned.length > 0 ? cleaned : "Untitled";
}

async function graphAppToken(): Promise<string> {
  const tenant = process.env.PICKUPS_GRAPH_TENANT_ID;
  const client = process.env.PICKUPS_GRAPH_CLIENT_ID;
  const secret = process.env.PICKUPS_GRAPH_CLIENT_SECRET;
  if (!tenant || !client || !secret) throw new Error("PICKUPS_GRAPH_* not configured");
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: client,
      client_secret: secret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Graph token ${res.status}`);
  return json.access_token as string;
}

const DRIVE_USER = "Dean@DMNarration.com";

/**
 * NEVER OVERWRITE.
 *
 * `@microsoft.graph.conflictBehavior=rename` makes Graph suffix the name itself
 * rather than replace what is there. Silently replacing a previous take is data
 * loss nobody notices until they need the old one — and a narrator sending
 * "chapter 12.wav" twice is the normal case, not the exotic one.
 */
async function uploadNoOverwrite(
  token: string, path: string, body: Uint8Array, contentType: string,
): Promise<string> {
  const url =
    `https://graph.microsoft.com/v1.0/users/${DRIVE_USER}/drive/root:/${encodeURI(path)}:` +
    `/content?@microsoft.graph.conflictBehavior=rename`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
    body: body as unknown as BodyInit,
  });
  if (!res.ok) throw new Error(`Graph upload ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const created = await res.json();
  // Graph returns the name it ACTUALLY used, which is what gets recorded — the
  // requested path would be a lie the moment a rename happened.
  return created.parentReference?.path
    ? `${String(created.parentReference.path).replace(/^\/drive\/root:\//, "")}/${created.name}`
    : `${path.split("/").slice(0, -1).join("/")}/${created.name}`;
}

export async function GET(req: Request) {
  // Vercel cron sends this header; the internal bearer is accepted too so the
  // sweep can be triggered by hand when something is stuck.
  const auth = req.headers.get("authorization") ?? "";
  const isCron = auth === `Bearer ${process.env.CRON_SECRET}` && !!process.env.CRON_SECRET;
  const isInternal =
    !!process.env.ADMIN_SECRET_KEY && auth === `Bearer ${process.env.ADMIN_SECRET_KEY}`;
  if (!isCron && !isInternal) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let bucket: string;
  try {
    bucket = pickupsBucket();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 503 });
  }

  const { data: pending, error } = await supabaseAdmin.rpc("pending_pickup_uploads", {
    p_limit: 20,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (pending ?? []) as {
    id: string; r2_key: string; original_name: string; content_type: string;
    book_title: string; pickups_folder: string | null; chapter: string;
    narrator_name: string; attempts: number;
  }[];
  if (rows.length === 0) return NextResponse.json({ filed: 0, failed: 0, pending: 0 });

  const r2 = pickupsR2();
  let token: string | null = null;
  let tokenError: string | null = null;
  try {
    token = await graphAppToken();
  } catch (e) {
    tokenError = (e as Error).message;
  }

  const filed: string[] = [];
  const failed: { id: string; error: string }[] = [];

  for (const row of rows) {
    try {
      if (!token) throw new Error(tokenError ?? "no Graph token");

      const obj = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: row.r2_key }));
      const body = await obj.Body!.transformToByteArray();

      const ext = row.r2_key.split(".").pop() ?? "bin";
      const book = row.pickups_folder ?? sanitiseSegment(row.book_title);
      const path =
        `Pickups/${book}/${sanitiseSegment(row.narrator_name)}/` +
        `${sanitiseSegment(`${row.chapter} - ${row.original_name}`)}.${ext}`;

      const actual = await uploadNoOverwrite(token, path, body, row.content_type);
      await supabaseAdmin.rpc("mark_upload_filed", { p_id: row.id, p_path: actual });
      filed.push(actual);
    } catch (e) {
      const message = (e as Error).message;
      // RECORDED, NOT DROPPED. attempts increments even on the last try, so a
      // row that stopped being retried says so rather than looking untouched.
      await supabaseAdmin.rpc("mark_upload_failed", { p_id: row.id, p_error: message });
      failed.push({ id: row.id, error: message.slice(0, 200) });
    }
  }

  return NextResponse.json({ filed: filed.length, failed: failed.length, paths: filed, errors: failed });
}
