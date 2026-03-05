import { Redis } from "@upstash/redis";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import LogoutButton from "./LogoutButton";
import QuickLinks from "./QuickLinks";
import FileUpload from "./FileUpload";

export const dynamic = "force-dynamic";

const COOKIE_NAME = "dmn_admin_key";

/**
 * Initialize Upstash Redis connection
 */
const redis = new Redis({
  url: process.env.KV_REST_API_URL ?? "",
  token: process.env.KV_REST_API_TOKEN ?? "",
});

const QUICK_LINKS = [
  {
    label: "Wave Apps (Dashboard)",
    href: "https://next.waveapps.com/9c9842e4-3e7b-4c9b-a276-189d8f312e01/dashboard",
  },
  {
    label: "Microsoft 365 Admin",
    href: "https://admin.cloud.microsoft/?#/homepage",
  },
  {
    label: "Cloudflare R2 (Narration Demos)",
    href: "https://dash.cloudflare.com/1ac8744006bf0a438cba3989adcc230b/r2/default/buckets/narration-demos",
  },
  {
    label: "Resend (Domains)",
    href: "https://resend.com/domains/5f094384-505c-4d62-bc89-8f5677750153",
  },
  {
    label: "Porkbun (Domains)",
    href: "https://porkbun.com/account/domainsSpeedy?fo=1&oid=9471711",
  },
  {
    label: "Vercel (Login)",
    href: "https://vercel.com/login?next=%2Fkevins-projects-818a808d",
  },
] as const;

export default async function AdminStatsPage() {
  const secret = String(process.env.ADMIN_SECRET_KEY ?? "").trim();
  if (!secret) {
    throw new Error("ADMIN_SECRET_KEY environment variable is not set.");
  }

  const cookieStore = await cookies();
  const cookieKey = String(cookieStore.get(COOKIE_NAME)?.value ?? "").trim();

  if (!cookieKey || cookieKey !== secret) {
    return notFound();
  }

  const totalPlays = (await redis.get<number>("total_demo_plays")) ?? 0;

  const keys = await redis.keys("demo_play_count:*");

  const stats = await Promise.all(
    keys.map(async (key) => {
      const count = await redis.get<number>(key);

      return {
        genre: key.replace("demo_play_count:", ""),
        count: count ?? 0,
      };
    })
  );

  const sortedStats = stats.sort((a, b) => b.count - a.count);

  async function resetStatsAction() {
    "use server";

    const keysToDelete = await redis.keys("demo_play_count:*");

    if (keysToDelete.length > 0) {
      await redis.del(...keysToDelete);
    }

    await redis.del("total_demo_plays");

    revalidatePath("/admin/stats");
  }

  return (
    <main className="min-h-screen bg-[#050814] text-white p-6 md:p-12">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between border-b border-[#1A2550] pb-8">
          <h1 className="text-4xl font-bold tracking-tight text-[#D4AF37]">
            Analytics
          </h1>

          <div className="flex items-center gap-3">
            <form action={resetStatsAction}>
              <button
                type="submit"
                className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs font-bold text-red-400 transition hover:bg-red-500/20"
              >
                Clear All Data
              </button>
            </form>

            <LogoutButton />
          </div>
        </div>

        {/* Collapsible Quick Links */}
        <QuickLinks links={[...QUICK_LINKS]} defaultOpen={true} />

        {/* Upload Section */}
        <section className="mt-12 overflow-hidden rounded-2xl border border-[#1A2550] bg-[#0B1224] p-8 shadow-xl">
          <p className="text-white/30 text-[10px] uppercase tracking-[0.2em] font-bold">
            Media Upload
          </p>

          <h2 className="mt-2 text-xl font-semibold text-[#D4AF37]">
            Upload files to R2
          </h2>

          <div className="mt-6">
            <FileUpload />
          </div>
        </section>

        <div className="mt-12 bg-[#0B1224] border border-[#1A2550] rounded-2xl p-8 inline-block shadow-xl">
          <p className="text-white/30 text-[10px] uppercase tracking-[0.2em] font-bold">
            Lifetime Plays
          </p>

          <p className="mt-2 text-6xl font-mono text-white">
            {totalPlays.toLocaleString()}
          </p>
        </div>

        <div className="mt-12 overflow-hidden rounded-2xl border border-[#1A2550] bg-[#0B1224] shadow-xl">
          <table className="w-full text-left">
            <thead className="bg-[#050814]/50 text-[#D4AF37] text-[10px] uppercase tracking-[0.2em]">
              <tr>
                <th className="px-8 py-5">Genre</th>
                <th className="px-8 py-5 text-right">Plays</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[#1A2550]">
              {sortedStats.map((item) => (
                <tr
                  key={item.genre}
                  className="hover:bg-white/[0.02] transition-colors"
                >
                  <td className="px-8 py-6 font-semibold">{item.genre}</td>
                  <td className="px-8 py-6 text-right font-mono text-xl">
                    {item.count.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}