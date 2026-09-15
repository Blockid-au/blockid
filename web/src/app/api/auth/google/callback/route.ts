// GET /api/auth/google/callback?code=…&state=…   |   ?error=…
//
// Server-side Google sign-in, step 2 of 2. Google lands here by top-level
// navigation after the account chooser / consent screen:
//
//   ?error=<code>         → 302 /auth/login?google_error=<code>   (Google refused:
//                           access_denied, org_internal, admin_policy_enforced, …)
//   state cookie missing / tampered / expired / ≠ ?state  → 400 (CSRF / replay guard;
//                           the JSON carries a `retry` link back to /auth/login)
//   code exchange fails   → 302 /auth/login?google_error=<redirect_uri_mismatch |
//                           invalid_client | invalid_grant | token_invalid | exchange_failed>
//   happy path            → session cookie + 302 to `next` (same-origin path from the
//                           sealed state) or the onboarding/dashboard redirect,
//                           with ?logged_in=true like the GIS path.
//
// GET + top-level navigation, like /api/oauth/*/callback: outside the S20-A
// mutating-route guard; the session row it creates is the audited record
// (createSession → setAuditActor). One `[auth:google] <stage> <code>` line per
// failure — never the code, the token or the email.

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { OAuth2Client } from "google-auth-library";
import { absoluteSiteUrl } from "@/lib/site-url";
import {
  classifyGoogleExchangeError,
  googleOAuthStateCookieOptions,
  googleRedirectUri,
  isGoogleRedirectFlowConfigured,
  openGoogleOAuthState,
  stateMatches,
  GOOGLE_OAUTH_STATE_COOKIE,
} from "@/lib/auth/google-oauth";
import { sanitizeGoogleErrorCode } from "@/lib/auth/google-sign-in-errors";
import {
  completeGoogleLogin,
  logGoogleAuthFailure,
  verifyGoogleIdToken,
} from "@/lib/auth/google-login";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

async function clearStateCookie(): Promise<void> {
  const store = await cookies();
  const opts = googleOAuthStateCookieOptions();
  store.set({ ...opts, value: "", maxAge: 0 });
}

function backToLogin(code: string, next: string | null): NextResponse {
  const url = new URL(absoluteSiteUrl("/auth/login"));
  url.searchParams.set("google_error", code);
  if (next) url.searchParams.set("next", next);
  return NextResponse.redirect(url.toString(), { status: 302, headers: NO_STORE });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const store = await cookies();
  const opened = openGoogleOAuthState(store.get(GOOGLE_OAUTH_STATE_COOKIE)?.value);
  const next = opened.ok ? opened.state.next : null;

  // 1. Google said no (or the user did). The state cookie may be fine — clear it anyway.
  const googleError = sanitizeGoogleErrorCode(searchParams.get("error"));
  if (googleError) {
    logGoogleAuthFailure("google", googleError, { flow: "redirect" });
    await clearStateCookie();
    return backToLogin(googleError, next);
  }

  if (!isGoogleRedirectFlowConfigured()) {
    logGoogleAuthFailure("callback", "not_configured", { flow: "redirect" });
    return backToLogin("not_configured", next);
  }

  // 2. CSRF / replay guard: sealed cookie must open AND match ?state.
  const stateParam = searchParams.get("state");
  if (!opened.ok || !stateMatches(stateParam, opened.state.state)) {
    const reason = opened.ok ? "state_mismatch" : `state_${opened.reason}`;
    logGoogleAuthFailure("callback", reason, { flow: "redirect" });
    await clearStateCookie();
    return NextResponse.json(
      {
        ok: false,
        error: "state_mismatch",
        message:
          "This Google sign-in link is not the one this browser started (expired, reused, or cookies were blocked).",
        retry: "/auth/login?google_error=state_mismatch",
      },
      { status: 400, headers: NO_STORE },
    );
  }

  const code = searchParams.get("code");
  if (!code) {
    logGoogleAuthFailure("callback", "missing_code", { flow: "redirect" });
    await clearStateCookie();
    return backToLogin("missing_code", next);
  }

  // 3. Exchange the one-shot code (+ PKCE verifier) for tokens; we only need id_token.
  const redirectUri = googleRedirectUri();
  let idToken: string | null | undefined;
  const client = new OAuth2Client({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri,
  });
  try {
    const { tokens } = await client.getToken({
      code,
      codeVerifier: opened.state.codeVerifier,
      redirect_uri: redirectUri,
    });
    idToken = tokens.id_token;
  } catch (err) {
    const codeOut = classifyGoogleExchangeError(err);
    logGoogleAuthFailure("exchange", codeOut, {
      flow: "redirect",
      // The registered URI is the usual fix for redirect_uri_mismatch — safe to log.
      ...(codeOut === "redirect_uri_mismatch" ? { redirect_uri: redirectUri } : {}),
    });
    await clearStateCookie();
    return backToLogin(codeOut, next);
  }
  if (!idToken) {
    logGoogleAuthFailure("exchange", "no_id_token", { flow: "redirect" });
    await clearStateCookie();
    return backToLogin("exchange_failed", next);
  }

  // 4. Same verification + back half as the GIS POST route.
  const verified = await verifyGoogleIdToken(idToken, { client });
  await clearStateCookie();
  if (!verified.ok) {
    return backToLogin(verified.code === "token_incomplete" ? "token_invalid" : verified.code, next);
  }

  const done = await completeGoogleLogin(verified.profile, request, "redirect");
  if (!done.ok) return backToLogin(done.code, next);

  const target = new URL(absoluteSiteUrl(next ?? done.redirect));
  target.searchParams.set("logged_in", "true");
  return NextResponse.redirect(target.toString(), { status: 302, headers: NO_STORE });
}
