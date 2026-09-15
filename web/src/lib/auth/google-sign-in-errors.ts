// Google sign-in error codes → plain-language copy.
//
// Pure and client-safe (the login form imports it — no `server-only`, no
// Node APIs). The server routes never send Google's own message through;
// they map every failure to one of these short codes and the login page
// turns the code into something a founder can act on.
//
// Sources of a code:
//   * Google's authorize endpoint (`?error=` on the callback):
//     access_denied, admin_policy_enforced, org_internal, invalid_request,
//     unauthorized_client, unsupported_response_type, invalid_scope,
//     server_error, temporarily_unavailable, interaction_required, …
//   * Google's token endpoint (thrown by OAuth2Client.getToken):
//     invalid_grant, invalid_client, redirect_uri_mismatch, unauthorized_client
//   * Our own stages: not_configured, state_mismatch, missing_code,
//     token_invalid, email_unverified, login_failed, exchange_failed,
//     gis_failed (client widget), network (client fetch).

export const GOOGLE_CALLBACK_PATH = "/api/auth/google/callback";
export const GOOGLE_START_PATH = "/api/auth/google/start";

/** Codes are `[a-z0-9_]`, max 64 chars — anything else collapses to "unknown". */
export function sanitizeGoogleErrorCode(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  return /^[a-z0-9_]{1,64}$/.test(v) ? v : "unknown";
}

export interface GoogleSignInErrorCopy {
  /** One-line headline shown in red above the buttons. */
  title: string;
  /** What to do next — plain words, no jargon. */
  hint: string;
  /** True when the fix is on the Google Cloud console side (founder / ops), not the user's. */
  configuration: boolean;
}

/** Absolute callback URI Google must have registered — shown verbatim on redirect_uri_mismatch. */
export function googleCallbackUri(siteUrl?: string): string {
  const base = (siteUrl ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://blockid.au").replace(/\/+$/, "");
  return `${base}${GOOGLE_CALLBACK_PATH}`;
}

export function describeGoogleSignInError(
  code: string | null | undefined,
  opts: { siteUrl?: string } = {},
): GoogleSignInErrorCopy | null {
  const c = sanitizeGoogleErrorCode(code);
  if (!c) return null;
  switch (c) {
    case "access_denied":
    case "interaction_required":
    case "consent_required":
    case "login_required":
      return {
        title: "Google sign-in was cancelled.",
        hint: "You closed the Google window or chose not to continue. Try again, or use email below.",
        configuration: false,
      };
    case "access_blocked":
    case "org_internal":
    case "admin_policy_enforced":
    case "unauthorized_client":
      return {
        title: "Google blocked this sign-in (“Access blocked”).",
        hint:
          "The BlockID Google app is not yet verified for your account — usually the OAuth consent screen is still in “Testing”, so only listed test users can sign in. Sign in with email below while this is fixed on our side.",
        configuration: true,
      };
    case "redirect_uri_mismatch":
      return {
        title: "Google rejected the sign-in address (redirect_uri_mismatch).",
        hint: `This exact URI must be listed under Authorised redirect URIs for the OAuth client in Google Cloud: ${googleCallbackUri(opts.siteUrl)}`,
        configuration: true,
      };
    case "invalid_client":
      return {
        title: "Google did not recognise the BlockID app (invalid_client).",
        hint: "The client ID / secret pair is wrong or was rotated. Sign in with email below while this is fixed on our side.",
        configuration: true,
      };
    case "not_configured":
      return {
        title: "Google sign-in is not set up on this server.",
        hint: "Use email below.",
        configuration: true,
      };
    case "invalid_grant":
    case "state_mismatch":
    case "missing_code":
      return {
        title: "That Google sign-in link has expired.",
        hint: "Sign-in links are single-use and last 10 minutes. Start again with the Google button.",
        configuration: false,
      };
    case "token_invalid":
    case "exchange_failed":
    case "server_error":
    case "temporarily_unavailable":
      return {
        title: "Google could not confirm your identity just now.",
        hint: "Try again in a moment, or use the redirect option — it does not depend on the pop-up.",
        configuration: false,
      };
    case "email_unverified":
      return {
        title: "Your Google email address is not verified.",
        hint: "Verify the address with Google first, or sign in with email below.",
        configuration: false,
      };
    case "login_failed":
      return {
        title: "Google confirmed you, but creating your BlockID session failed.",
        hint: "Try again in a minute. If it keeps happening, sign in with email and contact support@blockid.au.",
        configuration: false,
      };
    case "gis_failed":
    case "popup_closed":
    case "popup_failed_to_open":
      return {
        title: "The Google pop-up did not complete.",
        hint: "Pop-ups or third-party cookies may be blocked. Use “Continue with Google (redirect)” — it works without either.",
        configuration: false,
      };
    case "network":
      return {
        title: "We could not reach BlockID after Google signed you in.",
        hint: "Check your connection and try the redirect option.",
        configuration: false,
      };
    default:
      return {
        title: `Google sign-in failed (${c}).`,
        hint: "Try “Continue with Google (redirect)”, or sign in with email below.",
        configuration: false,
      };
  }
}
