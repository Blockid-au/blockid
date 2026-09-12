// POST /api/auth/reset-password — Request password reset
// Body: { email }
//
// Release QA-4 P2-d: mints a single-use, 30-minute reset token and emails a
// link to /auth/reset?token=…. The account's password_hash is NOT touched
// here — it rotates only when the token is consumed with a new password
// (POST /api/auth/reset-password/confirm), so an anonymous caller can no
// longer lock a founder out by submitting their email.

import { NextResponse } from "next/server";
import {
  isValidEmail,
  normaliseEmail,
  requestPasswordReset,
  PASSWORD_RESET_TTL_MIN,
} from "@/lib/auth";
import { sendPasswordReset } from "@/lib/email";
import { checkRateLimit } from "@/lib/rate-limit";
import { hashIp, clientIpFromHeaders } from "@/lib/iphash";
import { apiRoute } from "@/lib/audit/api-route";
import { readJsonBody } from "@/lib/security/request-guards";

export const dynamic = "force-dynamic";

async function POST_handler(request: Request) {
  try {
    // Rate limit: 3 resets per IP per 15 minutes (prevent email flooding)
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const rl = await checkRateLimit(`reset:${ip}`, 3, 15 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many reset requests. Please try again later." },
        { status: 429 },
      );
    }

    // QA-4 P2-b — an empty / malformed body is a 400, never a 500.
    const parsed = await readJsonBody<{ email?: unknown }>(request);
    if (!parsed.ok) return parsed.response;
    const { email } = parsed.body ?? {};

    if (!isValidEmail(email)) {
      return NextResponse.json({ ok: false, error: "Valid email is required" }, { status: 400 });
    }

    const normalised = normaliseEmail(email);

    const result = await requestPasswordReset(normalised, {
      ipHash: hashIp(clientIpFromHeaders(request.headers)),
    });

    if (result.ok && result.token) {
      // Detect locale from cookie (best-effort)
      const cookieHeader = request.headers.get("cookie") ?? "";
      const locale = cookieHeader.includes("blockid_lang=vi") ? "vi" as const : "en" as const;

      void sendPasswordReset({
        to: normalised,
        token: result.token,
        ttlMinutes: PASSWORD_RESET_TTL_MIN,
        locale,
      }).catch(() => {});
    }

    // Always return success (don't reveal if email exists)
    return NextResponse.json({
      ok: true,
      message: "If an account exists, a password reset link has been sent.",
    });
  } catch (err) {
    console.error("[auth:reset-password] error:", err);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/auth/reset-password/route.ts", method: "POST" }, POST_handler);
