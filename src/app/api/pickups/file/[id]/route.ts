import { supabaseAdmin } from "@/lib/supabase-admin";
import { page, requireStaff, resolveAndRedirect } from "@/lib/pickup-resolve";

export const dynamic = "force-dynamic";

/**
 * Open OR DOWNLOAD a filed take, resolving its Graph id at THIS moment.
 *
 * `?as=download` hands back @microsoft.graph.downloadUrl instead of the
 * SharePoint page. One route, because the three outcomes — it redirects, the
 * file is gone, the lookup failed — are the same three either way, and a
 * separate download endpoint would be a second place for them to drift. It is
 * also the same gate: admin or editor, applied before any read.
 *
 * The row is read with the service key AFTER the session has been checked —
 * `requireStaff` runs first and returns before any read happens. The route
 * carries an upload id, which is a uuid nobody can guess, but "unguessable" is
 * not a permission check and has never been treated as one here.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireStaff();
  if (denied) return denied;

  const { id } = await params;
  const { data, error } = await supabaseAdmin
    .from("pickup_uploads")
    .select("id, original_name, onedrive_item_id, onedrive_web_url, onedrive_path, filed_at")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return page(502, "Could not read that upload", error.message.slice(0, 200));
  }
  if (!data) {
    return page(404, "No such upload", "That link does not correspond to an upload.");
  }
  if (!data.filed_at) {
    // STILL BEING FILED is a real, temporary state and not a failure. The file
    // is in quarantine under a uuid name; there is nothing useful to open yet.
    return page(
      409,
      "That take is still being filed",
      "It has been uploaded but not yet moved into the book's folder, so there " +
        "is nothing to open. This usually takes a few minutes.",
    );
  }

  // Anything that is not exactly "download" is an open. A typo must not
  // silently produce the other behaviour.
  const as = new URL(req.url).searchParams.get("as") === "download" ? "download" : "open";

  return resolveAndRedirect({
    itemId: data.onedrive_item_id,
    storedUrl: data.onedrive_web_url,
    storedPath: data.onedrive_path,
    kind: "file",
    label: data.original_name || "That take",
    // A row filed before locators existed heals itself the first time it is
    // opened, so the path lookup happens once rather than on every click.
    // Only the definite branch reaches these — see pickup-resolve.
    onConfirmedMissing: async () => {
      await supabaseAdmin.rpc("mark_upload_missing", { p_id: id });
    },
    onConfirmedPresent: async () => {
      await supabaseAdmin.rpc("mark_upload_present", { p_id: id });
    },
    onLocatorFound: async (itemId, webUrl) => {
      await supabaseAdmin
        .from("pickup_uploads")
        .update({ onedrive_item_id: itemId, onedrive_web_url: webUrl })
        .eq("id", id);
    },
  }, as);
}
