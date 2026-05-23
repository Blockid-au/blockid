import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { OAuth2Client } from "google-auth-library";
import {
  loginWithGoogle,
  setSessionCookie,
  normaliseEmail,
  type GoogleProfile,
} from "@/lib/auth";
import { hashIp, clientIpFromHeaders } from "@/lib/iphash";
import { getSupabaseAdmin } from "@/lib/supabase";

// POST /api/auth/google
// Body: { credential } — the Google ID token from Sign In With Google.
//
// Verifies the token against Google's tokeninfo endpoint, extracts the
// profile, upserts the app_user, creates a session, sets the cookie,
// and returns { ok, user, redirect }.

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

  const { credential } = (body as { credential?: string }) ?? {};
  if (!credential || typeof credential !== "string") {
    return NextResponse.json(
      { ok: false, error: "Missing credential (Google ID token)" },
      { status: 400 },
    );
  }

  // --- Verify the Google ID token ----------------------------------------
  // Use google-auth-library's OAuth2Client for reliable JWT verification.
  // This verifies signature against Google's public keys, checks expiry,
  // and validates the audience — more robust than the tokeninfo endpoint.
  const expectedClientId = process.env.GOOGLE_CLIENT_ID;
  if (!expectedClientId) {
    return NextResponse.json(
      { ok: false, error: "Google auth not configured" },
      { status: 503 },
    );
  }

  let tokenPayload: {
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
  };

  try {
    const client = new OAuth2Client(expectedClientId);
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: expectedClientId,
    });
    const payload = ticket.getPayload();
    if (!payload) {
      return NextResponse.json(
        { ok: false, error: "Empty token payload" },
        { status: 401 },
      );
    }
    tokenPayload = {
      sub: payload.sub,
      email: payload.email,
      email_verified: payload.email_verified,
      name: payload.name,
      picture: payload.picture,
    };
  } catch (err) {
    console.error("[blockid:auth] Google token verification failed", err);
    return NextResponse.json(
      { ok: false, error: "Invalid or expired Google token" },
      { status: 401 },
    );
  }

  if (!tokenPayload.sub || !tokenPayload.email) {
    return NextResponse.json(
      { ok: false, error: "Google token missing sub or email" },
      { status: 401 },
    );
  }

  if (tokenPayload.email_verified === false) {
    return NextResponse.json(
      { ok: false, error: "Google email not verified" },
      { status: 403 },
    );
  }

  const profile: GoogleProfile = {
    sub: tokenPayload.sub,
    email: tokenPayload.email,
    name: tokenPayload.name,
    picture: tokenPayload.picture,
  };

  // --- Login / upsert ----------------------------------------------------
  const ipHash = hashIp(clientIpFromHeaders(request.headers));
  const userAgent = request.headers.get("user-agent");

  // Check for referral code from cookie (set by client when ?ref= is captured).
  const store = await cookies();
  const referralCode = store.get("blockid_ref")?.value ?? null;

  const result = await loginWithGoogle(profile, { ipHash, userAgent, referralCode });

  if (!result.ok || !result.user || !result.sessionToken) {
    return NextResponse.json(
      { ok: false, error: "Login failed", reason: result.reason },
      { status: 500 },
    );
  }

  // Set HttpOnly session cookie.
  await setSessionCookie(result.sessionToken);

  const isAdmin =
    normaliseEmail(result.user.email) === "admin@blockid.au";

  // Check if user needs onboarding (onboarding_completed flag on app_users)
  let redirectPath = "/dashboard";
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data: appUser } = await supabase
      .from("app_users")
      .select("onboarding_completed")
      .eq("email", normaliseEmail(result.user.email))
      .single();
    if (!appUser?.onboarding_completed) {
      redirectPath = "/onboarding";
    }
  }

  return NextResponse.json({
    ok: true,
    user: result.user,
    redirect: redirectPath,
    ...(isAdmin ? { isAdmin: true } : {}),
  });
}

export const dynamic = "force-dynamic";
