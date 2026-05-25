// POST /api/auth/reset-password — Request password reset
// Body: { email }
// Generates a new temporary password and emails it to the user.
// The user can then log in with the temp password and set their own.

import { NextResponse } from "next/server";
import { isValidEmail, normaliseEmail, resetWithTempPassword } from "@/lib/auth";
import { sendPasswordReset } from "@/lib/email";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
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

    const body = await request.json();
    const { email } = body ?? {};

    if (!isValidEmail(email)) {
      return NextResponse.json({ ok: false, error: "Valid email is required" }, { status: 400 });
    }

    const normalised = normaliseEmail(email);

    const result = await resetWithTempPassword(normalised);

    if (result.ok && result.tempPassword) {
      // Detect locale from cookie (best-effort)
      const cookieHeader = request.headers.get("cookie") ?? "";
      const locale = cookieHeader.includes("blockid_lang=vi") ? "vi" as const : "en" as const;

      void sendPasswordReset({
        to: normalised,
        tempPassword: result.tempPassword,
        locale,
      }).catch(() => {});
    }

    // Always return success (don't reveal if email exists)
    return NextResponse.json({ ok: true, message: "If an account exists, a new password has been sent." });
  } catch (err) {
    console.error("[auth:reset-password] error:", err);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
