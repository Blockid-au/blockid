// POST /api/auth/login-password — Email + Password login
//
// Body: { email, password }
// Sets blockid_session cookie on success.

import { NextResponse } from "next/server";
import { loginWithPassword, setSessionCookie, isValidEmail } from "@/lib/auth";
import { checkAuthIdentityLimit, checkAuthIpCeiling } from "@/lib/security/auth-rate-limit";
import { claimForCurrentBrowser } from "@/lib/analyses/claim";
import { hashIp, clientIpFromHeaders } from "@/lib/iphash";
import { apiRoute } from "@/lib/audit/api-route";

export const dynamic = "force-dynamic";

/** The ONE message every failed credential check returns (P2-a). */
export const GENERIC_LOGIN_ERROR =
  "Invalid email or password. If you signed up with Google or a magic link, use that method or reset your password.";

function tooMany(resetIn: number) {
  return NextResponse.json(
    { ok: false, error: "Too many login attempts. Please try again later." },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.ceil(resetIn / 1000)),
        "X-RateLimit-Remaining": "0",
      },
    },
  );
}

async function POST_handler(request: Request) {
  // Release QA-2 F7: per-IP ceiling (trusted hop, 30/15 min) before the
  // body is parsed; the D3-CISO 5/15 min brute-force cap now applies per
  // (IP, email) so two founders behind one NAT never share a bucket.
  // See lib/security/auth-rate-limit.ts.
  const ceiling = checkAuthIpCeiling("login", request.headers);
  if (!ceiling.allowed) return tooMany(ceiling.resetIn);

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
    const identity = checkAuthIdentityLimit("login", request.headers, email as string);
    if (!identity.allowed) return tooMany(identity.resetIn);
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
      // Release QA-4 P2-a — the failure reason stays in the server log only.
      // `no_password` (known account with no password set) and
      // `invalid_credentials` (unknown email / wrong password) MUST be
      // indistinguishable to the caller: one message, one status, no
      // `reason` field — otherwise an attacker can enumerate which emails
      // exist and which auth method they use. Infrastructure failures are
      // a 503 so the client can retry, still without an account hint.
      console.warn("[auth:login-password] failed:", result.reason);
      if (result.reason === "not_configured" || result.reason === "db_error") {
        return NextResponse.json(
          { ok: false, error: "Authentication service unavailable — please try again" },
          { status: 503 },
        );
      }
      return NextResponse.json({ ok: false, error: GENERIC_LOGIN_ERROR }, { status: 401 });
    }

    await setSessionCookie(result.sessionToken!);

    // Same claim as signup — someone who ran an analysis logged out and then
    // signed in should find it waiting. Idempotent: the update filters on
    // `user_id is null`, so a repeat login claims nothing and errors on
    // nothing. See lib/analyses/claim.ts.
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
    console.error("[auth:login-password] error:", err);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/auth/login-password/route.ts", method: "POST" }, POST_handler);
