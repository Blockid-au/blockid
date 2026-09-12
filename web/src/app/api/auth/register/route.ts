// POST /api/auth/register — Email + Password registration
//
// Body: { email, password, displayName? }
// Creates new user with bcrypt-hashed password.
// Sets blockid_session cookie on success.

import { NextResponse } from "next/server";
import { registerWithPassword, setSessionCookie, isValidEmail } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { claimForCurrentBrowser } from "@/lib/analyses/claim";
import { hashIp, clientIpFromHeaders } from "@/lib/iphash";
import { apiRoute } from "@/lib/audit/api-route";

export const dynamic = "force-dynamic";

// Strip HTML tags to prevent stored XSS
function sanitizeName(raw: unknown): string | undefined {
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  return raw.replace(/<[^>]*>/g, "").trim().slice(0, 100);
}

async function POST_handler(request: Request) {
  // Rate limit: 3 registrations per IP per 15 minutes
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = checkRateLimit(`register:${ip}`, 3, 15 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many registration attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.resetIn / 1000)) } },
    );
  }
  let body: Record<string, unknown> | null = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  try {
    const { email, password, displayName } = body ?? {};

    if (!isValidEmail(email)) {
      return NextResponse.json({ ok: false, error: "Valid email is required" }, { status: 400 });
    }
    if (!password || typeof password !== "string") {
      return NextResponse.json({ ok: false, error: "Password is required" }, { status: 400 });
    }
    if ((password as string).length < 8) {
      return NextResponse.json({ ok: false, error: "Password must be at least 8 characters" }, { status: 400 });
    }

    const result = await registerWithPassword({
      email: email as string,
      password: password as string,
      displayName: sanitizeName(displayName),
      ipHash: hashIp(clientIpFromHeaders(request.headers)),
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

    // Rescue the work this browser did before it had an account: analyses
    // written against the blockid_anon cookie, plus any paid guest report
    // bought with the same email. Fail-soft and idempotent — see
    // lib/analyses/claim.ts. A failed claim must never fail a signup.
    const claimed = await claimForCurrentBrowser({
      userId: result.user!.id,
      email: result.user!.email,
    });

    return NextResponse.json({
      ok: true,
      claimed,
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

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/auth/register/route.ts", method: "POST" }, POST_handler);
