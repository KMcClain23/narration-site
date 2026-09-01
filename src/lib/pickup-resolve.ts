import "server-only";

import { NextResponse } from "next/server";

import { currentSession } from "@/lib/supabase/session";
import { graphAppToken, itemById, itemByPath } from "@/lib/pickup-graph";

/**
 * Resolving a stored Graph locator, at the moment somebody clicks it.
 *
 * ── WHY NOT JUST LINK THE PATH ─────────────────────────────────────────────
 *
 * `pickup_uploads.onedrive_path` is a string built from a book name and a
 * narrator name. It records where a file was put. It is not an address, and the
 * one row in that table is the proof: it was filed at 19:20:49 to
 * `Pickups/A Cowboy's Runaway/Dean/6 - Closing Credits.mp3` and that file has
 * since been deleted. A link built from the path would 404 on the only real row
 * this feature has — shipping broken on its single test case.
 *
 * So the item id is stored at filing time and resolved HERE, per click. A file
 * that was renamed or moved still opens; a file that is gone says so.
 *
 * ── THREE OUTCOMES, KEPT APART ─────────────────────────────────────────────
 *
 * Deliberately not two. "It is gone" and "I could not find out" look identical
 * to a user and are completely different facts, and collapsing them is the
 * mistake this codebase has made before — a drive-wide search returned 403 and
 * `(json.value ?? [])` turned a permission failure into "no hits", which then
 * got reported as evidence of absence.
 *
 *   303  it resolved — go to its CURRENT webUrl
 *   410  Graph says it is gone. A definite answer, and the page says so plainly
 *   502  the lookup could not be made. Says THAT, and does not claim the file
 *        is missing
 *
 * Never 404: that is the status a broken link produces, and the whole point is
 * to stop producing broken links. A person who clicks this gets a sentence
 * telling them what happened.
 */

export type Resolvable = {
  /** Graph driveItem id, or null when filing predates locator capture. */
  itemId: string | null;
  /** Where it was at filing time. Shown as context; never redirected to blindly. */
  storedUrl: string | null;
  /** The path recorded at filing. For the "here is what we know" line. */
  storedPath: string | null;
  /** What the thing is, for the message: "file" or "folder". */
  kind: "file" | "folder";
  /** A human label — the book, the take. */
  label: string;
  /** Called when a legacy path lookup finds the item, so the row self-heals. */
  onLocatorFound?: (itemId: string, webUrl: string | null) => Promise<void>;
};

/** Admin or editor. Both need to open a take; nobody else may. */
export async function requireStaff(): Promise<NextResponse | null> {
  const session = await currentSession();
  if (!session) return NextResponse.redirect(new URL("/admin/login", siteOrigin()));
  if (session.role !== "admin" && session.role !== "editor") {
    return page(403, "Not available", "This account cannot open pickup audio.");
  }
  return null;
}

function siteOrigin(): string {
  return process.env.PICKUPS_SITE_ORIGIN ?? "https://www.dmnarration.com";
}

const esc = (t: string) =>
  (t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * A page, not JSON. This is reached by clicking a link in a browser, so the
 * answer has to be readable by the person who clicked it.
 */
export function page(status: number, heading: string, detail: string, extra = ""): NextResponse {
  return new NextResponse(
    `<!doctype html><meta charset="utf-8">
     <meta name="viewport" content="width=device-width,initial-scale=1">
     <title>${esc(heading)}</title>
     <style>
       body{margin:0;min-height:100vh;display:grid;place-items:center;
            background:#06082E;color:#fff;
            font:15px/1.6 system-ui,-apple-system,Segoe UI,sans-serif}
       main{max-width:34rem;padding:2rem}
       h1{font-size:1.15rem;margin:0 0 .5rem}
       p{margin:.5rem 0;color:rgba(255,255,255,.72)}
       code{color:#E0C15A;word-break:break-all;font-size:.85em}
       a{color:#E0C15A}
     </style>
     <main><h1>${esc(heading)}</h1><p>${esc(detail)}</p>${extra}
     <p><a href="/pickups">Back to pickups</a></p></main>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

/**
 * Look the thing up and answer with a redirect or an explanation.
 *
 * NOTHING IS TRUSTED FROM THE ROW except the id. The stored webUrl is shown as
 * context in the "gone" case — it is what the address WAS — and is never
 * redirected to, because a stale address that happens to still resolve to
 * something else is worse than an honest failure.
 */
export async function resolveAndRedirect(target: Resolvable): Promise<NextResponse> {
  let item: Awaited<ReturnType<typeof itemById>>;
  try {
    const token = await graphAppToken();

    if (target.itemId) {
      item = await itemById(token, target.itemId);
    } else if (target.storedPath) {
      /*
        ── THE LEGACY ROW, WHICH IS THE ONLY REAL ONE ─────────────────────────

        Everything filed before locators were captured has a path and no id —
        which today is every row in the table. The path is still NOT linked: it
        is RESOLVED here, server-side, and the answer is whatever Graph says now.
        A stale path resolves to nothing and produces the honest "no longer in
        OneDrive" page, rather than a 404 from a link that was handed out as
        though it worked.

        When it does resolve, the id is written back, so a row heals itself the
        first time somebody opens it and never needs the path again.
      */
      const byPath = await itemByPath(token, target.storedPath);
      if (byPath) {
        item = { id: byPath.id, name: "", webUrl: byPath.webUrl, deleted: false };
        // Best effort: failing to memoise must not fail the click.
        await target.onLocatorFound?.(byPath.id, byPath.webUrl).catch(() => {});
      } else {
        item = null;
      }
    } else {
      return page(
        409,
        "No link was recorded for this",
        `This ${target.kind} has neither a OneDrive link nor a recorded path, so ` +
          `there is nothing to look up.`,
      );
    }
  } catch (e) {
    // COULD NOT FIND OUT. Not the same as gone, and it does not get to say so.
    return page(
      502,
      "Could not reach OneDrive",
      `The ${target.kind} could not be looked up just now — this says nothing ` +
        `about whether it is still there. Try again in a moment.`,
      `<p><code>${esc((e as Error).message.slice(0, 200))}</code></p>`,
    );
  }

  if (item === null || item.deleted) {
    return page(
      410,
      item?.deleted ? "That file is in the recycle bin" : `That ${target.kind} is no longer in OneDrive`,
      item?.deleted
        ? `${target.label} was deleted and is currently in OneDrive's recycle bin. ` +
          `Restoring it there will make this link work again.`
        : `${target.label} was filed successfully, but it is not in the drive any more — ` +
          `it has been deleted or moved outside the app's reach. The record of the ` +
          `filing is correct; the file is what is missing.`,
      target.storedPath
        ? `<p>It was filed to <code>${esc(target.storedPath)}</code>.</p>`
        : "",
    );
  }

  if (!item.webUrl) {
    return page(
      502,
      "No address came back",
      `The ${target.kind} exists, but OneDrive did not return a link for it.`,
    );
  }

  // 303, so a browser follows with GET regardless of how it got here.
  return NextResponse.redirect(item.webUrl, 303);
}
