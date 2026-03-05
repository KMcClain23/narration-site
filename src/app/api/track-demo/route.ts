import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';

// These use the environment variables you just shared
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

    // Increment play count for the specific demo title (e.g., "demo_play_count:Romantasy")
    await redis.incr(`demo_play_count:${title}`);

    // Track total plays across all demos for your dashboard
    await redis.incr("total_demo_plays");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Tracking error:", error);
    // Return a 200 status so a logging error doesn't stop the client's audio
    return NextResponse.json({ success: false }, { status: 200 });
  }
}