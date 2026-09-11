// S18-A review P1-2 — OAuth callbacks are bound to the SESSION, not to the
// state blob.
//
// `state.email` is caller-supplied (the CSRF nonce only proves the browser
// holds *a* session cookie); the token + evidence must land on the
// signed-in user's record — or their project's — so every callback
// requires a session and `state.email === user.email` (case-insensitive)
// BEFORE the code exchange or any write. The data-email fallback for a
// caller without a project is then `user.email`, never the state value.
//
// Kept out of `./http` so route tests that exercise `projectScopeOrDeny`
// do not have to mock `@/lib/auth` just because of this import.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import type { AppUser } from "@/lib/auth";

function normalise(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

/**
 * Resolve the session user for an OAuth callback, or the redirect to send:
 *   no session            → `redirectTo?error=<provider>_unauthenticated`
 *   state email ≠ session → `redirectTo?error=<provider>_email_mismatch`
 */
export async function oauthSessionOrRedirect(
  stateEmail: string,
  redirectTo: string,
  provider: string,
): Promise<
  | { user: AppUser; denied: null }
  | { user: null; denied: NextResponse }
> {
  const user = await getCurrentUser();
  const url = new URL(redirectTo);
  if (!user) {
    url.searchParams.set("error", `${provider}_unauthenticated`);
    return { user: null, denied: NextResponse.redirect(url.toString()) };
  }
  if (normalise(stateEmail) !== normalise(user.email)) {
    url.searchParams.set("error", `${provider}_email_mismatch`);
    return { user: null, denied: NextResponse.redirect(url.toString()) };
  }
  return { user, denied: null };
}
