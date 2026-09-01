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
  _req: Request,
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

  const content = await fetch(
    `https://graph.microsoft.com/v1.0/users/Dean@DMNarration.com/drive/items/${encodeURIComponent(data.clip_item_id)}/content`,
    { headers: { Authorization: `Bearer ${graph}` } },
  );
  if (!content.ok || !content.body) {
    return new NextResponse("Could not read the clip", { status: 502 });
  }

  return new NextResponse(content.body, {
    headers: {
      "Content-Type": "audio/wav",
      // Small and immutable once cut, but private: it is somebody's unreleased
      // audio and must not sit in a shared cache.
      "Cache-Control": "private, max-age=3600",
      "Content-Disposition": "inline",
    },
  });
}
