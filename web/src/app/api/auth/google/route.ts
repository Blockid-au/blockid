import { NextResponse } from "next/server";
import {
  loginWithGoogle,
  setSessionCookie,
  normaliseEmail,
  type GoogleProfile,
} from "@/lib/auth";
import { hashIp, clientIpFromHeaders } from "@/lib/iphash";

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
  // We call Google's tokeninfo endpoint which validates signature + expiry
  // and returns the decoded claims. This avoids pulling in google-auth-library.
  let tokenPayload: {
    sub?: string;
    email?: string;
    email_verified?: string;
    name?: string;
    picture?: string;
    aud?: string;
  };

  try {
    const verifyRes = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`,
    );
    if (!verifyRes.ok) {
      const text = await verifyRes.text();
      console.error("[blockid:auth] Google tokeninfo failed", {
        status: verifyRes.status,
        body: text,
      });
      return NextResponse.json(
        { ok: false, error: "Invalid Google token" },
        { status: 401 },
      );
    }
    tokenPayload = await verifyRes.json();
  } catch (err) {
    console.error("[blockid:auth] Google tokeninfo fetch error", err);
    return NextResponse.json(
      { ok: false, error: "Failed to verify Google token" },
      { status: 502 },
    );
  }

  // Validate audience matches our client ID.
  const expectedClientId = process.env.GOOGLE_CLIENT_ID;
  if (!expectedClientId) {
    return NextResponse.json(
      { ok: false, reason: "Google auth not configured" },
      { status: 503 },
    );
  }
  if (tokenPayload.aud !== expectedClientId) {
    console.error("[blockid:auth] Google token audience mismatch", {
      expected: expectedClientId,
      got: tokenPayload.aud,
    });
    return NextResponse.json(
      { ok: false, error: "Token audience mismatch" },
      { status: 401 },
    );
  }

  if (!tokenPayload.sub || !tokenPayload.email) {
    return NextResponse.json(
      { ok: false, error: "Google token missing sub or email" },
      { status: 401 },
    );
  }

  if (tokenPayload.email_verified === "false") {
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

  const result = await loginWithGoogle(profile, { ipHash, userAgent });

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

  return NextResponse.json({
    ok: true,
    user: result.user,
    redirect: "/dashboard",
    ...(isAdmin ? { isAdmin: true } : {}),
  });
}

export const dynamic = "force-dynamic";
