import { NextResponse } from "next/server";
import { apiRoute } from "@/lib/audit/api-route";
import {
  completeGoogleLogin,
  logGoogleAuthFailure,
  verifyGoogleIdToken,
} from "@/lib/auth/google-login";

// POST /api/auth/google
// Body: { credential } — the Google ID token from Sign In With Google (GIS).
//
// Verifies the token (signature against Google's public keys, expiry,
// audience) via google-auth-library, then runs the shared back half
// (lib/auth/google-login.ts): app_user upsert, session cookie, claim-on-auth,
// onboarding redirect. Returns { ok, user, redirect }.
//
// The server-side redirect alternative (no pop-up, no opener hand-off) is
// GET /api/auth/google/start → /api/auth/google/callback — same back half.

async function POST_handler(request: Request) {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    logGoogleAuthFailure("post", "invalid_json");
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const { credential } = (body as { credential?: string }) ?? {};
  if (!credential || typeof credential !== "string") {
    logGoogleAuthFailure("post", "missing_credential");
    return NextResponse.json(
      { ok: false, error: "Missing credential (Google ID token)", code: "missing_credential" },
      { status: 400 },
    );
  }

  const verified = await verifyGoogleIdToken(credential);
  if (!verified.ok) {
    const error =
      verified.code === "not_configured" ? "Google auth not configured"
      : verified.code === "email_unverified" ? "Google email not verified"
      : verified.code === "token_incomplete" ? "Google token missing sub or email"
      : "Invalid or expired Google token";
    return NextResponse.json({ ok: false, error, code: verified.code }, { status: verified.status });
  }

  const done = await completeGoogleLogin(verified.profile, request, "gis");
  if (!done.ok) {
    return NextResponse.json(
      { ok: false, error: "Login failed", code: done.code, reason: done.reason },
      { status: done.status },
    );
  }

  return NextResponse.json({
    ok: true,
    user: done.user,
    redirect: done.redirect,
    ...(done.isAdmin ? { isAdmin: true } : {}),
  });
}

export const dynamic = "force-dynamic";

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/auth/google/route.ts", method: "POST" }, POST_handler);
