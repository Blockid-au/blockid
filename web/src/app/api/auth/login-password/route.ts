// POST /api/auth/login-password — Email + Password login
//
// Body: { email, password }
// Sets blockid_session cookie on success.

import { NextResponse } from "next/server";
import { loginWithPassword, setSessionCookie, isValidEmail } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // Rate limit: 5 attempts per IP per 15 minutes
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = checkRateLimit(`login:${ip}`, 5, 15 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many login attempts. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(rl.resetIn / 1000)),
          "X-RateLimit-Remaining": "0",
        },
      },
    );
  }

  let body: Record<string, unknown> | null = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  try {
    const { email, password } = body ?? {};

    if (!isValidEmail(email)) {
      return NextResponse.json({ ok: false, error: "Valid email is required" }, { status: 400 });
    }
    if (!password || typeof password !== "string" || password.length < 1) {
      return NextResponse.json({ ok: false, error: "Password is required" }, { status: 400 });
    }

    const result = await loginWithPassword({
      email,
      password,
      ipHash: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
    });

    if (!result.ok) {
      const msg = result.reason === "no_password"
        ? "This account uses Google or magic link login. Set a password first or use those methods."
        : result.reason === "invalid_credentials"
          ? "Invalid email or password"
          : "Login failed";
      return NextResponse.json({ ok: false, error: msg }, { status: 401 });
    }

    await setSessionCookie(result.sessionToken!);

    return NextResponse.json({
      ok: true,
      user: {
        id: result.user!.id,
        email: result.user!.email,
        displayName: result.user!.displayName,
        role: result.user!.role,
        plan: result.user!.plan,
      },
    });
  } catch (err) {
    console.error("[auth:login-password] error:", err);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
