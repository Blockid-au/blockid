// POST /api/auth/reset-password/confirm — Consume a password reset token
// Body: { token, password }
//
// Release QA-4 P2-d: the second half of the token-based reset. Verifies the
// single-use, 30-minute token minted by POST /api/auth/reset-password,
// rotates the password hash, and revokes the user's other sessions. The
// user then signs in with the new password (no session is issued here).
//
// Falls under the same `auth-password-reset` fail-closed edge bucket as the
// request route (src/proxy.ts prefix match) plus a per-IP guard here.

import { NextResponse } from "next/server";
import { consumePasswordReset } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { apiRoute } from "@/lib/audit/api-route";
import { readJsonBody } from "@/lib/security/request-guards";

export const dynamic = "force-dynamic";

const MESSAGES: Record<string, { status: number; error: string }> = {
  weak_password: { status: 400, error: "Password must be at least 8 characters" },
  invalid_token: { status: 400, error: "This reset link is invalid or has expired. Request a new one." },
  expired: { status: 400, error: "This reset link is invalid or has expired. Request a new one." },
  already_used: { status: 400, error: "This reset link is invalid or has expired. Request a new one." },
  not_configured: { status: 503, error: "Authentication service unavailable — please try again" },
  db_error: { status: 503, error: "Authentication service unavailable — please try again" },
};

async function POST_handler(request: Request) {
  try {
    // 10 attempts per IP per 15 minutes — a token is ~190 bits so this is
    // about noise, not brute force.
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const rl = await checkRateLimit(`reset-confirm:${ip}`, 10, 15 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many attempts. Please try again later." },
        { status: 429 },
      );
    }

    const parsed = await readJsonBody<{ token?: unknown; password?: unknown }>(request);
    if (!parsed.ok) return parsed.response;
    const body = parsed.body && typeof parsed.body === "object" ? parsed.body : {};
    const token = typeof body.token === "string" ? body.token.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!token) {
      return NextResponse.json({ ok: false, error: "Reset token is required" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json(MESSAGES.weak_password, { status: 400 });
    }

    const result = await consumePasswordReset(token, password);
    if (!result.ok) {
      console.warn("[auth:reset-password/confirm] failed:", result.reason);
      const m = MESSAGES[result.reason ?? "invalid_token"] ?? MESSAGES.invalid_token;
      return NextResponse.json({ ok: false, error: m.error }, { status: m.status });
    }

    return NextResponse.json({ ok: true, message: "Password updated. Sign in with your new password." });
  } catch (err) {
    console.error("[auth:reset-password/confirm] error:", err);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute(
  { route: "api/auth/reset-password/confirm/route.ts", method: "POST" },
  POST_handler,
);
