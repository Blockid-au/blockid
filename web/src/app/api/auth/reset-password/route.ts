// POST /api/auth/reset-password — Request password reset via magic link
// Body: { email }
// Sends a magic link that, when consumed via /auth/verify?token=...,
// allows the user to set a new password.

import { NextResponse } from "next/server";
import { requestMagicLink, isValidEmail, normaliseEmail } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email } = body ?? {};

    if (!isValidEmail(email)) {
      return NextResponse.json({ ok: false, error: "Valid email is required" }, { status: 400 });
    }

    const normalised = normaliseEmail(email);

    // Check user exists
    const supabase = getSupabaseAdmin();
    if (supabase) {
      const { data: user } = await supabase
        .from("app_users")
        .select("id")
        .eq("email", normalised)
        .maybeSingle();

      if (!user) {
        // Don't reveal if email exists (security) — return success anyway
        return NextResponse.json({ ok: true, message: "If an account exists, a reset link has been sent." });
      }
    }

    // Create magic link with "login" intent (will log user in, then they can set password)
    const result = await requestMagicLink({
      email: normalised,
      intent: "login",
      pendingPayload: { next: "/workspace/profile?reset_password=true" },
    });

    if (result.ok) {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://blockid.au";
      const verifyUrl = `${siteUrl}/auth/verify?token=${result.token}`;

      await sendEmail({
        to: normalised,
        subject: "Reset Your BlockID Password",
        html: `
          <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px;">
            <h2 style="color:#1e293b;font-size:20px;">Reset Your Password</h2>
            <p style="color:#64748b;font-size:14px;line-height:1.6;">
              Click the link below to sign in and set a new password. This link expires in 15 minutes.
            </p>
            <a href="${verifyUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;margin:16px 0;">
              Reset Password
            </a>
            <p style="color:#94a3b8;font-size:12px;margin-top:24px;">
              If you didn't request this, you can safely ignore this email.
            </p>
            <p style="color:#cbd5e1;font-size:11px;margin-top:16px;">BlockID.au — Auschain PTY LTD | ACN 659 615 111</p>
          </div>
        `,
      }).catch(() => {});
    }

    // Always return success (don't reveal if email exists)
    return NextResponse.json({ ok: true, message: "If an account exists, a reset link has been sent." });
  } catch (err) {
    console.error("[auth:reset-password] error:", err);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
