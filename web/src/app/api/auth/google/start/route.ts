// GET /api/auth/google/start?next=/path
//
// Server-side Google sign-in, step 1 of 2 (see lib/auth/google-oauth.ts for
// why this exists next to the GIS pop-up). Mints a state nonce + PKCE
// verifier, seals them in an HttpOnly cookie scoped to /api/auth/google,
// and sends the browser to Google's account chooser. Google returns to
// /api/auth/google/callback.
//
// GET + top-level navigation: outside the S20-A mutating-route audit guard
// (like /api/oauth/*/callback); the session it eventually creates is the
// audited record (createSession → setAuditActor). Nothing is mutated here.

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { absoluteSiteUrl } from "@/lib/site-url";
import { safeNextPath } from "@/lib/security/safe-redirect";
import {
  buildGoogleAuthorizeUrl,
  createGoogleOAuthState,
  googleOAuthStateCookieOptions,
  googleRedirectUri,
  isGoogleRedirectFlowConfigured,
  sealGoogleOAuthState,
} from "@/lib/auth/google-oauth";

export const dynamic = "force-dynamic";

function backToLogin(code: string, next: string | null): NextResponse {
  const url = new URL(absoluteSiteUrl("/auth/login"));
  url.searchParams.set("google_error", code);
  if (next) url.searchParams.set("next", next);
  return NextResponse.redirect(url.toString(), { status: 302, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  // Open-redirect guard: same-origin absolute path only, else dropped.
  const next = safeNextPath(searchParams.get("next"), "") || null;
  const loginHint = (searchParams.get("login_hint") ?? "").trim().toLowerCase();

  if (!isGoogleRedirectFlowConfigured()) {
    console.error("[auth:google] start not_configured", JSON.stringify({ stage: "start", code: "not_configured" }));
    return backToLogin("not_configured", next);
  }

  const state = createGoogleOAuthState(next);
  let sealed: string;
  try {
    sealed = sealGoogleOAuthState(state);
  } catch {
    return backToLogin("not_configured", next);
  }

  const authorizeUrl = buildGoogleAuthorizeUrl({
    clientId: process.env.GOOGLE_CLIENT_ID!,
    redirectUri: googleRedirectUri(),
    state: state.state,
    codeVerifier: state.codeVerifier,
    loginHint: loginHint.includes("@") && loginHint.length <= 254 ? loginHint : null,
  });

  const store = await cookies();
  store.set({ ...googleOAuthStateCookieOptions(), value: sealed });

  return NextResponse.redirect(authorizeUrl, { status: 302, headers: { "Cache-Control": "no-store" } });
}
