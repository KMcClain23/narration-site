import "server-only";

/**
 * Microsoft Graph, for the narrator upload path.
 *
 * ── WHY THE BYTES GO STRAIGHT TO ONEDRIVE AND NOT VIA R2 ───────────────────
 *
 * The original design routed browser → R2 → OneDrive, on the reasoning that a
 * Graph URL in a browser is write access to Dean's drive. That was overstated:
 * `createUploadSession` returns a URL bound to ONE destination path, short-lived
 * and write-only — the same shape as a presigned PUT, not drive-wide access.
 *
 * The one property genuinely lost is that the magic-byte check no longer happens
 * BEFORE the bytes arrive. That is what the quarantine folder restores: the file
 * lands in `Pickups/_incoming/`, is verified there, and only then moves.
 *
 * R2 is not a fallback and is not reachable from this path at all. The reason is
 * recorded on the `pickup_uploads` table comment: both buckets the site's token
 * can reach answer an unsigned GET with 200, and that token cannot create a
 * private one.
 */

/** App-only Graph has no "me". The drive is addressed by user principal name. */
export const DRIVE_USER = "Dean@DMNarration.com";

/** Where uploads land before they are trusted. Visibly named on purpose. */
export const QUARANTINE_ROOT = "Pickups/_incoming";

export async function graphAppToken(): Promise<string> {
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

const ROOT = `https://graph.microsoft.com/v1.0/users/${DRIVE_USER}/drive`;

/** The path-addressed form Graph uses: /drive/root:/{path}: */
const byPath = (path: string) => `${ROOT}/root:/${encodeURI(path)}:`;

/**
 * An upload session for ONE destination path.
 *
 * The URL this returns is what the browser PUTs to. It is bound to this path,
 * expires in about an hour, and can do nothing else — which is why handing it to
 * a browser is acceptable where a general Graph token would not be.
 */
export async function createUploadSession(token: string, path: string): Promise<string> {
  const res = await fetch(`${byPath(path)}/createUploadSession`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      item: {
        // Quarantine names are server-chosen UUIDs, so a collision means
        // something is wrong; failing is better than silently renaming.
        "@microsoft.graph.conflictBehavior": "fail",
      },
    }),
  });
  if (!res.ok) throw new Error(`createUploadSession ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  return json.uploadUrl as string;
}

/** The first bytes of a file, for the sniff. A range read, not a download. */
export async function readHead(token: string, path: string, bytes = 63): Promise<Uint8Array> {
  const res = await fetch(`${byPath(path)}/content`, {
    headers: { Authorization: `Bearer ${token}`, Range: `bytes=0-${bytes}` },
  });
  if (!res.ok && res.status !== 206) {
    throw new Error(`read ${res.status}: ${(await res.text()).slice(0, 150)}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

export async function itemByPath(token: string, path: string): Promise<{ id: string; size: number } | null> {
  const res = await fetch(byPath(path), { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`stat ${res.status}`);
  const json = await res.json();
  return { id: json.id as string, size: Number(json.size ?? 0) };
}

export async function deleteByPath(token: string, path: string): Promise<void> {
  const res = await fetch(byPath(path), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 404) throw new Error(`delete ${res.status}`);
}

/** Create a folder if it is missing, so a move has somewhere to land. */
async function ensureFolder(token: string, path: string): Promise<string> {
  const existing = await itemByPath(token, path);
  if (existing) return existing.id;

  const parts = path.split("/");
  const name = parts.pop()!;
  const parent = parts.join("/");
  if (parent) await ensureFolder(token, parent);

  const url = parent ? `${byPath(parent)}/children` : `${ROOT}/root/children`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      folder: {},
      "@microsoft.graph.conflictBehavior": "return",
    }),
  });
  if (!res.ok) throw new Error(`mkdir ${res.status}: ${(await res.text()).slice(0, 150)}`);
  return (await res.json()).id as string;
}

/**
 * MOVE, not download-and-reupload. A Graph PATCH on parentReference and name.
 *
 * NEVER OVERWRITES. Graph's move has no conflictBehavior, so a name already in
 * use is detected first and suffixed — silently replacing a previous take is
 * data loss nobody notices until they need the old one, and a narrator sending
 * "chapter 12.wav" twice is the normal case.
 *
 * Returns the path actually used, which is what gets recorded: the requested one
 * would be a lie the moment a suffix was added.
 */
export async function moveItem(
  token: string, fromPath: string, destFolder: string, desiredName: string,
): Promise<string> {
  const folderId = await ensureFolder(token, destFolder);

  const dot = desiredName.lastIndexOf(".");
  const stem = dot > 0 ? desiredName.slice(0, dot) : desiredName;
  const ext = dot > 0 ? desiredName.slice(dot) : "";

  let name = desiredName;
  for (let n = 2; n < 100; n++) {
    if (!(await itemByPath(token, `${destFolder}/${name}`))) break;
    name = `${stem} (${n})${ext}`;
  }

  const res = await fetch(byPath(fromPath), {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ parentReference: { id: folderId }, name }),
  });
  if (!res.ok) throw new Error(`move ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return `${destFolder}/${name}`;
}

/** Children of a folder, or [] when the folder does not exist. */
export async function listChildren(
  token: string, path: string,
): Promise<{ id: string; name: string; folder?: unknown; createdDateTime: string }[]> {
  const res = await fetch(`${byPath(path)}/children`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`list ${res.status}`);
  return (await res.json()).value ?? [];
}
