"use server";

import { Redis } from '@upstash/redis';
import { revalidatePath } from 'next/cache';

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

/**
 * Deletes all demo play counters and the total counter.
 * Requires the ADMIN_SECRET_KEY for authorization.
 */
export async function resetStats(key: string) {
  // Security check: ensure the caller has the secret key
  if (key !== process.env.ADMIN_SECRET_KEY) {
    throw new Error("Unauthorized");
  }

  // Find all play count keys using the pattern
  const keys = await redis.keys('demo_play_count:*');
  
  // Batch delete play counts if they exist
  if (keys.length > 0) {
    await redis.del(...keys);
  }
  
  // Reset the lifetime total
  await redis.del("total_demo_plays");

  // Force Next.js to purge the cache for the stats page
  revalidatePath('/admin/stats');
  
  return { success: true };
}