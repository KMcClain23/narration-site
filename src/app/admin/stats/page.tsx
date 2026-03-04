import { Redis } from '@upstash/redis';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { resetStats } from '@/app/actions/resetStats'; // Verify this path

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

export const dynamic = 'force-dynamic';

export default async function AdminStatsPage({
  searchParams,
}: {
  searchParams: { key?: string };
}) {
  // Access key from the URL query string
  const secretKey = searchParams.key;

  // Hidden Access Check
  if (secretKey !== process.env.ADMIN_SECRET_KEY) {
    return notFound(); 
  }

  const totalPlays = await redis.get<number>('total_demo_plays') || 0;
  const keys = await redis.keys('demo_play_count:*');
  
  const stats = await Promise.all(
    keys.map(async (key) => {
      const count = await redis.get<number>(key);
      return {
        genre: key.replace('demo_play_count:', ''),
        count: count || 0,
      };
    })
  );

  const sortedStats = stats.sort((a, b) => b.count - a.count);

  return (
    <main className="min-h-screen bg-[#050814] text-white p-6 md:p-12">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between border-b border-[#1A2550] pb-8">
          <div>
            <h1 className="text-4xl font-bold tracking-tight">Private Analytics</h1>
            <p className="mt-2 text-[#D4AF37] text-sm uppercase tracking-widest font-bold">
              Authenticated Access Only
            </p>
          </div>
          
          {/* Inline Reset Form */}
          <form action={async () => {
            "use server";
            await resetStats(secretKey!);
          }}>
            <button 
              type="submit"
              className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs font-bold text-red-400 transition hover:bg-red-500/20 hover:text-red-300"
            >
              Reset All Counts
            </button>
          </form>
        </div>
        
        {/* Metric Card */}
        <div className="mt-12">
          <div className="inline-block rounded-2xl border border-[#1A2550] bg-[#0B1224] p-8 shadow-2xl">
            <p className="text-white/50 text-xs uppercase tracking-widest font-bold">Total Lifetime Plays</p>
            <p className="mt-4 text-5xl font-mono text-[#D4AF37]">{totalPlays.toLocaleString()}</p>
          </div>
        </div>

        {/* Stats Table */}
        <h2 className="mt-16 text-2xl font-bold">Demo Performance</h2>
        <div className="mt-6 overflow-hidden rounded-2xl border border-[#1A2550] bg-[#0B1224]">
          <table className="w-full text-left">
            <thead className="bg-[#050814]/50 text-[#D4AF37] text-[10px] uppercase tracking-[0.2em]">
              <tr>
                <th className="px-8 py-5">Genre</th>
                <th className="px-8 py-5 text-right">Plays</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1A2550]">
              {sortedStats.length > 0 ? sortedStats.map((item) => (
                <tr key={item.genre} className="hover:bg-white/[0.02] transition-colors group">
                  <td className="px-8 py-6 font-semibold group-hover:text-[#D4AF37] transition-colors">
                    {item.genre}
                  </td>
                  <td className="px-8 py-6 text-right font-mono text-xl text-white/90">
                    {item.count.toLocaleString()}
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={2} className="px-8 py-12 text-center text-white/30 italic">No data points yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-12 flex justify-center">
          <Link href="/" className="text-xs text-white/20 hover:text-white transition">Exit to Public Site</Link>
        </div>
      </div>
    </main>
  );
}