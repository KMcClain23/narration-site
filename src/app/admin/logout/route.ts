import { NextResponse } from "next/server";

const COOKIE_NAME = "dmn_admin_key";

export async function POST() {
  const res = NextResponse.json({ success: true });

  res.cookies.set({
    name: COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });

  return res;
}