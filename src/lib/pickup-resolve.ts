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
  /**
   * Called ONLY when Graph gave a DEFINITE answer that the thing is gone.
   *
   * Never from the 502 branch. A lookup that could not be made is not evidence
   * of absence, and treating it as one would mark every filed take in the
   * system missing during a single Graph outage.
   */
  onConfirmedMissing?: () => Promise<void>;
  /** Called when it resolves — clears a stale "missing", e.g. after a restore. */
  onConfirmedPresent?: () => Promise<void>;
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
export async function resolveAndRedirect(
  target: Resolvable,
  /**
   * WHAT TO HAND BACK when it resolves.
   *
   * "open" is the OneDrive page — a SharePoint preview, right for "show me
   * where this lives". "download" is @microsoft.graph.downloadUrl, which is
   * pre-authenticated, short-lived, and hands the browser the actual bytes
   * under the file's own name.
   *
   * A VARIANT, NOT A SECOND ENDPOINT. The three outcomes — 303, 410 gone, 502
   * could-not-find-out — are the whole value of this function, and a download
   * route that re-implemented them would get one of them wrong. This is the
   * only line that differs between the two.
   */
  as: "open" | "download" = "open",
): Promise<NextResponse> {
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
        // A path lookup does not carry a download URL. Rather than guess one,
        // the id it just found is looked up again below — the row heals on this
        // click and downloads correctly on this click too.
        item = {
          id: byPath.id, name: "", webUrl: byPath.webUrl,
          downloadUrl: null, deleted: false,
        };
        if (as === "download") {
          const withUrl = await itemById(token, byPath.id);
          if (withUrl) item = withUrl;
        }
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
    /*
      THE DEFINITE BRANCH, and the only one that records absence.

      Graph answered — 404, 410, or an item carrying a deleted facet. That is a
      fact about the file, and it is written down so the badge stops claiming
      the take is there. The 502 branch above deliberately does NOT do this.
    */
    await target.onConfirmedMissing?.().catch(() => {});
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

  const address = as === "download" ? item.downloadUrl : item.webUrl;
  if (!address) {
    return page(
      502,
      "No address came back",
      as === "download"
        ? `The ${target.kind} is there, but OneDrive did not return a download ` +
          `link for it. Opening it in OneDrive should still work.`
        : `The ${target.kind} exists, but OneDrive did not return a link for it.`,
    );
  }

  // IT RESOLVED. If the row was marked missing, the file has come back — a
  // restore from the recycle bin — and the mark is cleared. The same write-back
  // that heals a locator-less row, running in the other direction.
  await target.onConfirmedPresent?.().catch(() => {});

  /*
    REDIRECT, NEVER PROXY.

    A take can be 200 MB. Streaming it through this route would put every byte
    through Vercel for no gain: the download URL is already pre-authenticated,
    already ranged, and already serves the file under its own descriptive name
    — "take - Closing Credits.mp3" — which is exactly what should land in her
    downloads folder.

    303, so a browser follows with GET regardless of how it got here.
  */
  return NextResponse.redirect(address, 303);
}
