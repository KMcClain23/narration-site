import { NextResponse } from "next/server";

import { batchByToken } from "@/lib/pickup-link";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { graphAppToken, itemById } from "@/lib/pickup-graph";

export const dynamic = "force-dynamic";

/**
 * The ±10s clip, as playable audio.
 *
 * ── WHY THIS STREAMS RATHER THAN REDIRECTING ───────────────────────────────
 *
 * The file links elsewhere redirect to a OneDrive `webUrl`, which is a
 * SharePoint *page* — fine for "open this in the drive", useless as an
 * `<audio src>`. An inline player needs the bytes, so this fetches them
 * server-side and passes them through.
 *
 * ── WHY IT MUST ANSWER RANGE REQUESTS ──────────────────────────────────────
 *
 * It did not, and every clip on the narrator's page read 0:00 / 0:00.
 *
 * `<audio>` opens with `Range: bytes=0-`. This route answered 200 with no
 * Content-Length and no Accept-Ranges, so the browser had bytes but no length:
 * `duration` came back Infinity, `readyState` stopped at HAVE_METADATA, and
 * `error` was null. Nothing failed. The player simply never learned how long
 * the audio was, and a duration of Infinity renders as 0:00 — which reads as a
 * broken clip and had Ann and Dean concluding the files were bad.
 *
 * The files were never bad. Two clips cut two seconds apart from the same
 * source, byte-identical in size, behaved "differently" only in whether anyone
 * pressed play past a display that said there was nothing there.
 *
 * So the client's Range header is passed straight through to Graph, whose
 * /content endpoint already supports it, and the 206, Content-Range and
 * Content-Length come back with it. A request with no Range still gets an
 * explicit Content-Length, which is what makes duration computable at all.
 *
 * ── THE TOKEN IS THE CREDENTIAL, AND IT IS CHECKED AGAINST THIS PICKUP ─────
 *
 * ANON GAINS NO PRIVILEGE — the same decision the narrator page was built on.
 * The batch is resolved from the token with the service key, and the requested
 * pickup must be IN that batch. Without that check, a valid token for chapter 3
 * would stream any clip in the system to anyone holding it, which is a worse
 * hole than the page it sits on was designed to avoid.
 *
 * A dead token and a pickup outside the batch answer identically, for the same
 * reason the page does not distinguish expired from unknown.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string; pickupId: string }> },
) {
  const { token, pickupId } = await params;

  const batch = await batchByToken(token);
  if (!batch) return new NextResponse("Not available", { status: 404 });

  const row = batch.find(r => r.pickup_id === pickupId);
  if (!row || !row.clip_id) return new NextResponse("Not available", { status: 404 });

  // The drive address is read only after the token has been shown to grant it.
  const { data, error } = await supabaseAdmin
    .from("pickups")
    .select("clip_item_id, clip_path")
    .eq("id", pickupId)
    .maybeSingle();
  if (error || !data?.clip_item_id) return new NextResponse("Not available", { status: 404 });

  let item: Awaited<ReturnType<typeof itemById>>;
  let graph: string;
  try {
    graph = await graphAppToken();
    item = await itemById(graph, data.clip_item_id);
  } catch {
    /*
      COULD NOT FIND OUT — 502, not 404.

      The page shows a player only when a clip exists, so a 404 here would read
      as "the clip is gone" when the truth may be that OneDrive was briefly
      unreachable. The two are kept apart everywhere else in this codebase and
      they are kept apart here.
    */
    return new NextResponse("Could not reach OneDrive", { status: 502 });
  }

  // Resolved at play time, like every other link to a filed file: clip_cut_at
  // records that the clip was placed there, not that it is still there.
  if (item === null || item.deleted) return new NextResponse("Clip no longer in OneDrive", { status: 410 });

  // PASSED THROUGH, NOT INVENTED. Whatever the player asked for is what Graph
  // is asked for, so a seek to the middle of the clip costs one ranged read
  // rather than the whole file.
  const range = req.headers.get("range");
  const content = await fetch(
    `https://graph.microsoft.com/v1.0/users/Dean@DMNarration.com/drive/items/${encodeURIComponent(data.clip_item_id)}/content`,
    {
      headers: {
        Authorization: `Bearer ${graph}`,
        ...(range ? { Range: range } : {}),
      },
    },
  );
  if (!content.ok || !content.body) {
    return new NextResponse("Could not read the clip", { status: 502 });
  }

  const headers = new Headers({
    "Content-Type": "audio/wav",
    // WITHOUT THIS THE PLAYER NEVER ASKS FOR A RANGE and can never seek.
    "Accept-Ranges": "bytes",
    // Small and immutable once cut, but private: it is somebody's unreleased
    // audio and must not sit in a shared cache.
    "Cache-Control": "private, max-age=3600",
    "Content-Disposition": "inline",
  });

  // Mirrored from upstream rather than recomputed. Content-Range in particular
  // has to agree with the bytes actually being sent, and Graph is the only
  // thing that knows what it served.
  const length = content.headers.get("content-length");
  const contentRange = content.headers.get("content-range");
  if (length) headers.set("Content-Length", length);
  if (contentRange) headers.set("Content-Range", contentRange);

  // Graph answers 206 to a ranged request; that status is the player's signal
  // that ranges work, so it is passed on rather than flattened to 200.
  return new NextResponse(content.body, {
    status: content.status === 206 ? 206 : 200,
    headers,
  });
}
