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
export async function createUploadSession(
  token: string,
  path: string,
  /**
   * What to do if the path is taken. Valid values are fail | replace | rename —
   * "return" is NOT one of them and Graph 400s on it, which this codebase has
   * already been caught by once.
   *
   * QUARANTINE DEFAULTS TO "fail": its names are server-chosen UUIDs, so a
   * collision means something is wrong and failing beats silently renaming.
   * A script re-uploaded for the same book wants "replace" — it is a corrected
   * draft of the same document, and "Book (1).pdf" would break the one-file-per-
   * book convention the whole Scripts/ folder rests on.
   */
  conflictBehavior: "fail" | "replace" | "rename" = "fail",
): Promise<string> {
  const res = await fetch(`${byPath(path)}/createUploadSession`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      item: { "@microsoft.graph.conflictBehavior": conflictBehavior },
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

export async function itemByPath(
  token: string, path: string,
): Promise<{ id: string; size: number; webUrl: string | null } | null> {
  const res = await fetch(byPath(path), { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`stat ${res.status}`);
  const json = await res.json();
  return { id: json.id as string, size: Number(json.size ?? 0), webUrl: json.webUrl ?? null };
}

/**
 * An item BY ID, which is the only address that survives a rename or a move.
 *
 * ── THE THREE OUTCOMES ARE KEPT APART, AND THAT IS THE ENTIRE POINT ────────
 *
 *   { … }   it is there; `webUrl` is where it is NOW
 *   null    Graph says it is gone (404 or 410) — a definite answer
 *   throws  the lookup could not be made: token, network, 5xx, throttling
 *
 * Collapsing the last two into "gone" is the failure this project keeps
 * finding: a drive-wide search once returned 403 and `(json.value ?? [])` turned
 * a permission failure into "no hits", which was then reported as evidence. A
 * caller here must be able to tell "the file has been deleted" from "I could not
 * find out", because it is about to tell a person one of those two things.
 */
export async function itemById(
  token: string, id: string,
): Promise<{
  id: string;
  name: string;
  webUrl: string | null;
  /**
   * The pre-authenticated download URL Graph returns on the driveItem.
   *
   * SHORT-LIVED, AND NEVER STORED. It carries its own authorisation and expires
   * in minutes, so it is fetched at click time and handed straight to the
   * browser — the same rule as the item id versus the path, one level down: the
   * id is the durable handle, this is the momentary one.
   */
  downloadUrl: string | null;
  deleted: boolean;
} | null> {
  const res = await fetch(`${ROOT}/items/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  // 404 and 410 are both "no longer there", said two ways.
  if (res.status === 404 || res.status === 410) return null;
  if (!res.ok) throw new Error(`item ${res.status}: ${(await res.text()).slice(0, 150)}`);
  const json = await res.json();
  // An item in the recycle bin still resolves; `deleted` is a facet Graph sets.
  // It is NOT the same as gone, and the caller says so differently.
  return {
    id: json.id as string,
    name: (json.name as string) ?? "",
    webUrl: json.webUrl ?? null,
    downloadUrl: json["@microsoft.graph.downloadUrl"] ?? null,
    deleted: json.deleted != null,
  };
}

export async function deleteByPath(token: string, path: string): Promise<void> {
  const res = await fetch(byPath(path), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 404) throw new Error(`delete ${res.status}`);
}

/** Create a folder if it is missing, so a move has somewhere to land. */
export async function ensureFolder(
  token: string, path: string,
): Promise<{ id: string; webUrl: string | null }> {
  const existing = await itemByPath(token, path);
  if (existing) return { id: existing.id, webUrl: existing.webUrl };

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
      /*
        "fail", NOT "return".

        Graph rejects "return" on this endpoint outright — 400, "The value for
        name@conflictBehavior is invalid". This went unnoticed because it is
        only reached when a folder genuinely does not exist: the check above
        returns early otherwise, and uploadManifest's PUT-to-path creates
        parents on its own. So the first genuinely new book or narrator folder
        created through THIS path would have failed the filing.

        Found while migrating the pickups tree, where every chapter folder was
        new.
      */
      "@microsoft.graph.conflictBehavior": "fail",
    }),
  });
  // A conflict means something created it between the check and now. Re-read it
  // rather than failing a filing over a race.
  if (res.status === 409) {
    const raced = await itemByPath(token, path);
    if (raced) return { id: raced.id, webUrl: raced.webUrl };
  }
  if (!res.ok) throw new Error(`mkdir ${res.status}: ${(await res.text()).slice(0, 150)}`);
  const made = await res.json();
  return { id: made.id as string, webUrl: made.webUrl ?? null };
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
 * would be a lie the moment a suffix was added — AND the item id and webUrl from
 * the move response, because a path is not a locator. Anything that later offers
 * this file to a person must address it by id; the path is a record of where it
 * went, not a working address.
 */
export async function moveItem(
  token: string, fromPath: string, destFolder: string, desiredName: string,
): Promise<{ path: string; id: string | null; webUrl: string | null; folder: { id: string; webUrl: string | null } }> {
  const folder = await ensureFolder(token, destFolder);

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
    body: JSON.stringify({ parentReference: { id: folder.id }, name }),
  });
  if (!res.ok) throw new Error(`move ${res.status}: ${(await res.text()).slice(0, 200)}`);
  // The PATCH response IS the moved item, so the locator costs no extra call.
  // Parsed defensively: a move that succeeded must not be reported as failed
  // because the body was not what was expected, and a missing id degrades to
  // "no locator stored" rather than losing the filing.
  const moved = await res.json().catch(() => ({}) as Record<string, unknown>);
  return {
    path: `${destFolder}/${name}`,
    id: (moved as { id?: string }).id ?? null,
    webUrl: (moved as { webUrl?: string }).webUrl ?? null,
    folder,
  };
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


/**
 * ── THE SWEEP'S CONTAINMENT, ENFORCED BY THE QUERY ─────────────────────────
 *
 * THE SWEEP WAS EXONERATED. Do not read the existence of this code as evidence
 * that it once misbehaved. Two manifests went missing from a book folder, the
 * sweep was the leading suspect, and the recycle bin settled it: both were
 * "Deleted by: Dean Miller" — his own account, from a synced client — while
 * every row the app touched is attributed to "SharePoint App". The sweep never
 * reached them, and could not have.
 *
 * This stayed anyway, because it is correct on its own terms: containment that
 * depends on how carefully a path string was assembled is one typo from being
 * wrong, and "I read it and it looked right" was exactly the evidence available
 * during the investigation — which was not enough to settle anything.
 *
 * So containment stops depending on how a path string is built. These helpers
 * resolve `Pickups/_incoming` to an ITEM ID once, walk by id, and refuse to
 * delete anything whose own parentReference does not sit inside that folder. A
 * malformed path can no longer address a sibling of the quarantine root, because
 * paths are not used to address anything.
 */

export type DriveItem = {
  id: string;
  name: string;
  size: number;
  folder?: unknown;
  createdDateTime: string;
  parentReference?: { id?: string; path?: string };
};

const GRAPH_ROOT = `https://graph.microsoft.com/v1.0/users/${DRIVE_USER}/drive`;

/** The quarantine folder itself, or null when it does not exist yet. */
export async function quarantineFolder(token: string): Promise<DriveItem | null> {
  const res = await fetch(`${GRAPH_ROOT}/root:/${encodeURI(QUARANTINE_ROOT)}:`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`quarantine stat ${res.status}`);
  return (await res.json()) as DriveItem;
}

export async function childrenById(token: string, id: string): Promise<DriveItem[]> {
  const res = await fetch(`${GRAPH_ROOT}/items/${id}/children`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`children ${res.status}`);
  return ((await res.json()).value ?? []) as DriveItem[];
}

/**
 * Delete by ID, and ONLY inside quarantine.
 *
 * The parent check is not belt-and-braces over the id lookup — it is the thing
 * that makes this safe to call at all. An item is deleted only when its own
 * `parentReference.path` is the quarantine root or a folder beneath it, as
 * reported by Graph rather than as assembled here. Anything else throws, loudly,
 * rather than being skipped quietly.
 */
export async function deleteInsideQuarantine(token: string, item: DriveItem): Promise<void> {
  const parent = item.parentReference?.path ?? "";
  const root = `/drive/root:/${QUARANTINE_ROOT}`;
  if (parent !== root && !parent.startsWith(`${root}/`)) {
    throw new Error(
      `REFUSED to delete ${item.name}: its parent is ${parent || "(unknown)"}, ` +
        `which is outside ${QUARANTINE_ROOT}`,
    );
  }
  const res = await fetch(`${GRAPH_ROOT}/items/${item.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 404) throw new Error(`delete ${res.status}`);
}
