import { NextResponse } from "next/server";
import {
  isValidEmail,
  normaliseEmail,
  requestMagicLink,
  MAGIC_LINK_TTL_MIN,
  type MagicLinkIntent,
  type PendingPayload,
} from "@/lib/auth";
import { sendMagicLink } from "@/lib/email";
import { hashIp, clientIpFromHeaders } from "@/lib/iphash";

// POST /api/auth/request
// Body: { email, intent?, pendingPayload? }
// Behaviour:
//   - Validates email; rejects on bad input.
//   - Creates a magic_links row (15-min expiry) with optional pendingPayload
//     (the in-flight idea-eval / equity-split / funding-plan state).
//   - Fires the magic-link email via Resend. Email is fire-and-forget so we
//     don't leak existence-of-account through timing (always returns ok=true
//     for any well-formed input).
//
// We never confirm or deny whether the email already has an account. Account
// upsert happens at consume-time, so a bad actor can't enumerate users.

export async function POST(request: Request) {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const { email, intent, pendingPayload, next } =
    (body as {
      email?: string;
      intent?: MagicLinkIntent;
      pendingPayload?: PendingPayload;
      next?: string;
    }) ?? {};

  if (!isValidEmail(email)) {
    return NextResponse.json(
      { ok: false, error: "Valid email is required" },
      { status: 400 },
    );
  }

  const safeIntent: MagicLinkIntent =
    intent === "login" ? "login" : "save_founder_pack";

  const ipHash = hashIp(clientIpFromHeaders(request.headers));

  // Merge the post-login redirect into the pending payload so the verify
  // route can honour it after the magic link is consumed.
  const mergedPayload: PendingPayload = {
    ...(pendingPayload ?? {}),
    ...(next && typeof next === "string" && next.startsWith("/")
      ? { next }
      : {}),
  };

  const result = await requestMagicLink({
    email: normaliseEmail(email),
    intent: safeIntent,
    pendingPayload: mergedPayload,
    ipHash,
  });

  if (result.ok) {
    // Fire-and-forget. Don't block the funnel on Resend latency / failure.
    void sendMagicLink({
      to: normaliseEmail(email),
      token: result.token,
      intent: safeIntent,
      ttlMinutes: MAGIC_LINK_TTL_MIN,
    });
  } else if (result.reason === "not_configured") {
    // Dev convenience: print the verify URL so localhost flows work without
    // Resend / Supabase configured.
    const siteUrl = (
      process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
    ).replace(/\/$/, "");
    console.warn(
      "[blockid:auth] Dev magic-link (Supabase not configured):",
      `${siteUrl}/auth/verify?token=${encodeURIComponent(result.token)}`,
    );
  }

  // Always 200 — never disclose whether the email exists or whether infra is
  // healthy. The user sees "check your inbox" either way.
  return NextResponse.json({ ok: true, ttlMinutes: MAGIC_LINK_TTL_MIN });
}

export const dynamic = "force-dynamic";
