// Google sign-in — the shared back half.
//
// Both entry points end here once Google has vouched for an identity:
//   * POST /api/auth/google            — GIS pop-up hands the page an ID token
//   * GET  /api/auth/google/callback   — server-side authorization-code flow
//
// verifyGoogleIdToken()  ID token → GoogleProfile (signature, expiry, audience)
// completeGoogleLogin()  profile   → app_user upsert + session cookie +
//                                    claim-on-auth + onboarding redirect
//
// Every failure is ONE structured log line: `[auth:google] <stage> <code>`.
// The token, the authorization code and the email never appear in it.

import "server-only";

import { cookies } from "next/headers";
import { OAuth2Client } from "google-auth-library";
import {
  loginWithGoogle,
  setSessionCookie,
  normaliseEmail,
  type AppUser,
  type GoogleProfile,
} from "@/lib/auth";
import { hashIp, clientIpFromHeaders } from "@/lib/iphash";
import { getSupabaseAdmin } from "@/lib/supabase";
import { claimForCurrentBrowser } from "@/lib/analyses/claim";
import { classifyGoogleExchangeError } from "./google-oauth";

export type GoogleFlow = "gis" | "redirect";

/** One line per failure — stage + short code only (never the token / code / email). */
export function logGoogleAuthFailure(stage: string, code: string, extra: Record<string, unknown> = {}): void {
  console.error(`[auth:google] ${stage} ${code}`, JSON.stringify({ stage, code, ...extra }));
}

export type VerifyGoogleIdTokenResult =
  | { ok: true; profile: GoogleProfile }
  | { ok: false; status: number; code: "not_configured" | "token_invalid" | "token_incomplete" | "email_unverified" };

/** Verify a Google ID token (signature against Google's keys, expiry, audience) → profile. */
export async function verifyGoogleIdToken(
  idToken: string,
  opts: { client?: OAuth2Client } = {},
): Promise<VerifyGoogleIdTokenResult> {
  const expectedClientId = process.env.GOOGLE_CLIENT_ID;
  if (!expectedClientId) return { ok: false, status: 503, code: "not_configured" };

  let payload: {
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
  } | undefined;
  try {
    const client = opts.client ?? new OAuth2Client(expectedClientId);
    const ticket = await client.verifyIdToken({ idToken, audience: expectedClientId });
    payload = ticket.getPayload();
  } catch (err) {
    logGoogleAuthFailure("verify", classifyGoogleExchangeError(err));
    return { ok: false, status: 401, code: "token_invalid" };
  }
  if (!payload?.sub || !payload.email) {
    logGoogleAuthFailure("verify", "token_incomplete");
    return { ok: false, status: 401, code: "token_incomplete" };
  }
  if (payload.email_verified === false) {
    logGoogleAuthFailure("verify", "email_unverified");
    return { ok: false, status: 403, code: "email_unverified" };
  }
  return {
    ok: true,
    profile: { sub: payload.sub, email: payload.email, name: payload.name, picture: payload.picture },
  };
}

export type CompleteGoogleLoginResult =
  | { ok: true; user: AppUser; redirect: string; isAdmin: boolean }
  | { ok: false; status: 500; code: "login_failed"; reason?: string };

/**
 * Upsert the app_user, create the session + cookie, claim any pre-signup
 * work for this browser, and decide the landing page (/onboarding until the
 * flag is set, else /dashboard).
 */
export async function completeGoogleLogin(
  profile: GoogleProfile,
  request: Request,
  flow: GoogleFlow,
): Promise<CompleteGoogleLoginResult> {
  const ipHash = hashIp(clientIpFromHeaders(request.headers));
  const userAgent = request.headers.get("user-agent");

  // Referral + reseller attribution cookies (set client-side when ?ref= / ?via= is captured).
  const store = await cookies();
  const referralCode = store.get("blockid_ref")?.value ?? null;
  const resellerCode = store.get("blockid_via")?.value ?? null;

  const result = await loginWithGoogle(profile, { ipHash, userAgent, referralCode, resellerCode });
  if (!result.ok || !result.user || !result.sessionToken) {
    logGoogleAuthFailure("login", "login_failed", { flow, reason: result.reason ?? null });
    return { ok: false, status: 500, code: "login_failed", reason: result.reason };
  }

  await setSessionCookie(result.sessionToken);

  // A Google sign-in is a login: claim pre-signup anonymous analyses and paid
  // guest reports for this email. Fail-soft + idempotent.
  await claimForCurrentBrowser({ userId: result.user.id, email: result.user.email });

  const email = normaliseEmail(result.user.email);
  const isAdmin = email === "admin@blockid.au";

  let redirect = "/dashboard";
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data: appUser } = await supabase
      .from("app_users")
      .select("onboarding_completed")
      .eq("email", email)
      .single();
    if (!appUser?.onboarding_completed) redirect = "/onboarding";
  }

  console.info(`[auth:google] login ok`, JSON.stringify({ flow, user: result.user.id, redirect }));
  return { ok: true, user: result.user, redirect, isAdmin };
}
