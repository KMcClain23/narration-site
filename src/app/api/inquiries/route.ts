import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { Redis } from "@upstash/redis";

const COOKIE_NAME = "dmn_admin_key";
const INQUIRY_KEY = "dmn_inquiries";

const redis = new Redis({
  url: process.env.KV_REST_API_URL ?? "",
  token: process.env.KV_REST_API_TOKEN ?? "",
});

/**
 * POST: Public - Author/Narrator submits a request
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, email, role, message } = body;

    if (!name || !email || !message) {
      return NextResponse.json({ error: "Required fields missing" }, { status: 400 });
    }

    const newInquiry = {
      id: crypto.randomUUID(),
      name,
      email,
      role, // "Author", "Narrator", or "Other"
      message,
      status: "unread",
      createdAt: new Date().toISOString(),
    };

    await redis.lpush(INQUIRY_KEY, JSON.stringify(newInquiry));

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to send inquiry" }, { status: 500 });
  }
}

/**
 * GET: Protected - Admin views all inquiries
 */
export async function GET() {
  const cookieStore = await cookies();
  if (cookieStore.get(COOKIE_NAME)?.value !== process.env.ADMIN_SECRET_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = await redis.lrange(INQUIRY_KEY, 0, -1);
  const inquiries = raw.map((i: any) => (typeof i === 'string' ? JSON.parse(i) : i));
  return NextResponse.json(inquiries);
}