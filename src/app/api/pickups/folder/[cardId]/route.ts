import { supabaseAdmin } from "@/lib/supabase-admin";
import { page, requireStaff, resolveAndRedirect } from "@/lib/pickup-resolve";

export const dynamic = "force-dynamic";

/**
 * Open a book's pickups folder.
 *
 * `board_cards.pickups_folder` holds "A Cowboy's Runaway" — a NAME, and the same
 * problem the file link has one level up. A URL built from it breaks on any
 * rename, and a folder is exactly the kind of thing that gets renamed. The id is
 * recorded when the folder is ensured during filing, and resolved here.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ cardId: string }> },
) {
  const denied = await requireStaff();
  if (denied) return denied;

  const { cardId } = await params;
  const { data, error } = await supabaseAdmin
    .from("board_cards")
    .select("id, title, pickups_folder, pickups_folder_item_id, pickups_folder_web_url")
    .eq("id", cardId)
    .maybeSingle();

  if (error) return page(502, "Could not read that book", error.message.slice(0, 200));
  if (!data) return page(404, "No such book", "That link does not correspond to a book.");

  return resolveAndRedirect({
    itemId: data.pickups_folder_item_id,
    storedUrl: data.pickups_folder_web_url,
    storedPath: data.pickups_folder ? `Pickups/${data.pickups_folder}` : null,
    kind: "folder",
    label: `The pickups folder for ${data.title}`,
    onLocatorFound: async (itemId, webUrl) => {
      await supabaseAdmin
        .from("board_cards")
        .update({ pickups_folder_item_id: itemId, pickups_folder_web_url: webUrl })
        .eq("id", cardId);
    },
  });
}
