import { NextResponse } from "next/server";

// Clears a PRE-MIGRATION cookie. dmn_admin_key is no longer a credential and
// nothing reads it; this exists so a browser that still holds one does not carry
// it around looking like a login. The real sign-out is
// supabase.auth.signOut(), in useLogout.
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