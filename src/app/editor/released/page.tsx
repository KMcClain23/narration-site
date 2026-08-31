import Link from "next/link";
import Image from "next/image";
import { editorBoard } from "@/lib/editor-data";

export const dynamic = "force-dynamic";

/**
 * Released books, off the hub.
 *
 * Twelve of the 33 cards, and none of it is work — a third of her page spent on
 * things that are finished. It is still worth reaching (she may want to look
 * something up), so it moved rather than disappearing.
 *
 * NO NEW AUTH WORK, and that was confirmed rather than assumed: `/editor` and
 * everything beneath it is matched by `isPrivateRoute` (no marketing chrome) and
 * gated by the editor layout against `roleAdmits`, which admits editor OR admin.
 * A route added under `/editor/` inherits both by construction — see
 * admin-routes.ts, where `/editor` is a prefix and not an exact path.
 */
export default async function EditorReleasedPage() {
  const cards = await editorBoard();
  const released = cards
    .filter(c => c.status === "released")
    .sort((a, b) => a.title.localeCompare(b.title));

  return (
    <>
      <Link href="/editor" className="text-xs text-white/40 hover:text-white/70">
        ← Your books
      </Link>

      <div className="mb-5 mt-3 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-lg font-bold">Released</h1>
        <p className="text-xs text-white/40">
          {released.length} book{released.length === 1 ? "" : "s"}
        </p>
      </div>

      {released.length === 0 ? (
        <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-sm text-white/50">
          Nothing released yet.
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {released.map(c => (
            <Link
              key={c.id}
              href={`/editor/card/${c.id}`}
              className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-2.5 transition-colors hover:border-white/25"
            >
              <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-white/5">
                {c.cover_url ? (
                  <Image src={c.cover_url} alt="" fill sizes="40px" className="object-cover" />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-white/80">{c.title}</p>
                <p className="truncate text-[11px] text-white/40">{c.author ?? "—"}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
