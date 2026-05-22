// POST /api/auth/register — Email + Password registration
//
// Body: { email, password, displayName? }
// Creates new user with bcrypt-hashed password.
// Sets blockid_session cookie on success.

import { NextResponse } from "next/server";
import { registerWithPassword, setSessionCookie, isValidEmail } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password, displayName } = body ?? {};

    if (!isValidEmail(email)) {
      return NextResponse.json({ ok: false, error: "Valid email is required" }, { status: 400 });
    }
    if (!password || typeof password !== "string") {
      return NextResponse.json({ ok: false, error: "Password is required" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ ok: false, error: "Password must be at least 8 characters" }, { status: 400 });
    }

    const result = await registerWithPassword({
      email,
      password,
      displayName: displayName || undefined,
      ipHash: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
    });

    if (!result.ok) {
      const msg = result.reason === "email_taken"
        ? "An account with this email already exists. Try logging in instead."
        : result.reason === "weak_password"
          ? "Password must be at least 8 characters"
          : "Registration failed";
      return NextResponse.json({ ok: false, error: msg }, { status: result.reason === "email_taken" ? 409 : 400 });
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
    console.error("[auth:register] error:", err);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
