import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';

// Initialize the Redis client using environment variables from Vercel
const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

export async function POST(request: Request) {
  try {
    const { title } = await request.json();

    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    // Increment play counts in the Upstash database
    await redis.incr(`demo_play_count:${title}`);
    await redis.incr("total_demo_plays");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Tracking error:", error);
    // Return a 200 status so a tracking failure doesn't break the user's audio player
    return NextResponse.json({ success: false }, { status: 200 });
  }
}