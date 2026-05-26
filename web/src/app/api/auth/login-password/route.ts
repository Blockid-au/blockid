// POST /api/auth/login-password — Email + Password login
//
// Body: { email, password }
// Sets blockid_session cookie on success.

import { NextResponse } from "next/server";
import { loginWithPassword, setSessionCookie, isValidEmail } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { hashIp, clientIpFromHeaders } from "@/lib/iphash";

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
      ipHash: hashIp(clientIpFromHeaders(request.headers)),
      userAgent: request.headers.get("user-agent"),
    });

    if (!result.ok) {
      console.warn("[auth:login-password] failed:", result.reason);
      const msg = result.reason === "no_password"
        ? "This account uses Google or magic link login. Set a password first or use those methods."
        : result.reason === "invalid_credentials"
          ? "Invalid email or password"
          : result.reason === "not_configured"
            ? "Authentication service unavailable"
            : result.reason === "db_error"
              ? "Database error — please try again"
              : `Login failed (${result.reason ?? "unknown"})`;
      return NextResponse.json({ ok: false, error: msg, reason: result.reason }, { status: 401 });
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
