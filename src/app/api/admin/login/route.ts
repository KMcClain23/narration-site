import { NextResponse } from "next/server";

const COOKIE_NAME = "dmn_admin_key";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const providedKey = String(body?.key ?? "").trim();
    const secret = String(process.env.ADMIN_SECRET_KEY ?? "").trim();

    if (!secret) {
      return NextResponse.json(
        { success: false, error: "ADMIN_SECRET_KEY is not set." },
        { status: 500 }
      );
    }

    if (!providedKey || providedKey !== secret) {
      return NextResponse.json(
        { success: false, error: "Invalid key." },
        { status: 401 }
      );
    }

    const res = NextResponse.json({ success: true });

    res.cookies.set({
      name: COOKIE_NAME,
      value: secret,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return res;
  } catch {
    return NextResponse.json(
      { success: false, error: "Bad request." },
      { status: 400 }
    );
  }
}