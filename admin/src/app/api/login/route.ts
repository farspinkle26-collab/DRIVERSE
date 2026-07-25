import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { SESSION_COOKIE, expectedToken, safeEqual } from "@/lib/session";

// POST /api/login  { password }  → sets the session cookie on success.
export async function POST(req: NextRequest) {
  let password = "";
  const contentType = req.headers.get("content-type") || "";
  try {
    if (contentType.includes("application/json")) {
      const body = await req.json();
      password = String(body.password ?? "");
    } else {
      const form = await req.formData();
      password = String(form.get("password") ?? "");
    }
  } catch {
    password = "";
  }

  const expected = env.adminPassword();
  if (!password || !safeEqual(password, expected)) {
    return NextResponse.json({ ok: false, error: "Incorrect password" }, { status: 401 });
  }

  const token = await expectedToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
  return res;
}

// POST /api/login/logout is handled by clearing here via DELETE.
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
