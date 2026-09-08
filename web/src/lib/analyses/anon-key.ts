// Anonymous owner key — the only handle a logged-out founder has on their
// own saved analysis.
//
// A visitor pastes an idea into the hero, gets a real SVI score, and has no
// account. Something has to own that row, and it cannot be the IP (shared,
// rotating, and a far more identifying thing to store). So we mint one
// random opaque id, put it in an httpOnly cookie, and write every anonymous
// analysis against it.
//
// This is a correlation key, NOT a profile:
//   * no identity, no email, no behaviour is ever attached to it;
//   * httpOnly, so page scripts and third-party tags cannot read it;
//   * it is superseded the moment the visitor signs in — claim-on-signup
//     moves the rows onto the user_id and deletes the cookie.
//
// Long-lived (365 days) on purpose: "come back next month and your analysis
// is still there" is the entire point. Short of that it is the 60-second
// module singleton we are replacing.

import { cookies } from "next/headers";
import { nanoid } from "nanoid";

export const ANON_COOKIE = "blockid_anon";
export const ANON_COOKIE_MAX_AGE_DAYS = 365;

/** 24 chars of nanoid ≈ 144 bits — not guessable, not enumerable. */
export function newAnonKey(): string {
  return nanoid(24);
}

/**
 * Accept only what `newAnonKey` could have produced (plus a little slack for
 * older/longer keys). Anything else is treated as absent, so a hand-crafted
 * cookie cannot be used to probe for other people's rows with a short or
 * pattern-matched value.
 */
export function isValidAnonKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 16 &&
    value.length <= 64 &&
    /^[A-Za-z0-9_-]+$/.test(value)
  );
}

function secureFlag(): boolean {
  return process.env.NODE_ENV === "production"
    ? true
    : (process.env.NEXT_PUBLIC_SITE_URL?.startsWith("https") ?? false);
}

/** Read the anon key already on the request, or null. Never throws. */
export async function readAnonKey(): Promise<string | null> {
  try {
    const store = await cookies();
    const raw = store.get(ANON_COOKIE)?.value;
    return isValidAnonKey(raw) ? raw : null;
  } catch {
    return null;
  }
}

/**
 * Read the anon key, minting and setting one when absent. Returns the key
 * plus whether it was freshly issued (useful for logging, not for logic).
 *
 * Fail-soft: if the cookie store is unavailable we still return a usable key
 * so the caller can write a row — an un-cookied row is orphaned, which is
 * strictly better than losing the analysis.
 */
export async function ensureAnonKey(): Promise<{ key: string; issued: boolean }> {
  try {
    const store = await cookies();
    const raw = store.get(ANON_COOKIE)?.value;
    if (isValidAnonKey(raw)) return { key: raw, issued: false };
    const key = newAnonKey();
    store.set({
      name: ANON_COOKIE,
      value: key,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: ANON_COOKIE_MAX_AGE_DAYS * 24 * 60 * 60,
      secure: secureFlag(),
    });
    return { key, issued: true };
  } catch {
    return { key: newAnonKey(), issued: true };
  }
}

/**
 * Drop the cookie after a successful claim. The rows now belong to a
 * user_id; keeping the key around would only let a later logged-out visitor
 * on the same browser see them.
 */
export async function clearAnonCookie(): Promise<void> {
  try {
    const store = await cookies();
    store.delete(ANON_COOKIE);
  } catch {
    /* nothing to clear */
  }
}
