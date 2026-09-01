import type { Metadata } from "next";
import { headers } from "next/headers";
import { batchByToken, clientIp, notesByToken, rateLimit } from "@/lib/pickup-link";
import { NarratorConfirm } from "./NarratorConfirm";

export const dynamic = "force-dynamic";

/**
 * A forwarded link must not end up crawled. This page is reachable by anyone
 * holding the URL and by definition has no login in front of it, so the one
 * thing that must never happen is a search engine keeping a copy.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Ann's whole experience of this system.
 *
 * She has no account and will not get one. She opens a link from her email and
 * sees her pickups for one chapter of one book — the same batch the email and
 * the manifest cover — reads each correction in full, and says she has
 * re-recorded them. That is the entire surface.
 *
 * SHE CANNOT CLOSE ANYTHING. `mark_returned_by_token` moves sent → returned and
 * nothing else; verification is Marizete's and happens on the editor page. A
 * narrator marking her own work verified would remove the check the whole flow
 * exists for.
 */

/** The one thing said to anyone whose link does not work, whatever the reason. */
function Expired() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#06082E] px-6 text-white">
      <div className="w-full max-w-md rounded-2xl border border-[#1A2070] bg-[#0A0D3A] p-6 text-center">
        <h1 className="text-base font-bold">This link has expired</h1>
        <p className="mt-3 text-sm text-white/60">
          Pickup links stop working after a while, and a new one replaces the old.
        </p>
        <p className="mt-3 text-sm text-white/50">
          Check for a more recent email, or reply to the last one and a fresh link will be sent.
        </p>
      </div>
    </main>
  );
}

export default async function NarratorPickupPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const h = await headers();

  // Refuse enumeration rather than logging it. A miss is cheap; 30 in a minute
  // from one address is not a person reading their email.
  if (!(await rateLimit(clientIp(h), "read", 30, 60))) return <Expired />;

  const rows = await batchByToken(token);
  // Read after the batch, so a dead token never reaches it.
  const notes = rows ? await notesByToken(token) : [];
  if (!rows) return <Expired />;

  const { book_title, chapter, narrator_name } = rows[0];
  const outstanding = rows.filter(r => r.status === "sent");
  const done = rows.filter(r => r.status === "returned");

  return (
    <main className="min-h-screen bg-[#06082E] px-5 py-10 text-white">
      <div className="mx-auto max-w-2xl">
        <p className="text-sm text-white/50">Pickups for {narrator_name}</p>
        <h1 className="mt-1 text-2xl font-bold">{book_title}</h1>
        <p className="mt-1 text-lg text-white/70">
          {/^\d/.test(chapter.trim()) ? `Chapter ${chapter}` : chapter}
        </p>

        <NarratorConfirm token={token} outstanding={outstanding} done={done} notes={notes} />

        <p className="mt-10 text-xs text-white/30">
          Marking these re-recorded tells Dean and Marizete the audio is ready to check. It
          does not close them — Marizete listens and confirms.
        </p>
      </div>
    </main>
  );
}
