// Reseller attribution capture — mirrors the `?ref=` referral pattern.
//
// Per docs/plans/reseller-module-plan.md § C.2 (redemption UX) and § A.4:
// the existing referral flow at web/src/components/svi/svi-entrance.tsx:213
// writes cookie + localStorage on URL `?ref=<code>`. We mirror the same
// mechanic for `?via=<reseller_code>` so consumption sites (auth flow,
// onboarding wizard, checkout) can find the code without changing shape.

// NOTE: this module is imported by client components (billing-client.tsx
// → share-mgmt-drawer.tsx). Do NOT add server-only imports (e.g.
// `node:crypto`) here. Server-only helpers live in ./attribution-server.ts.

/** URL param name for reseller code. */
export const VIA_PARAM = "via";

/** Cookie + localStorage key. Kept in sync with the SvI referral pattern. */
export const VIA_KEY = "blockid_via";

/** 30-day cookie TTL — matches the referral cookie. */
export const VIA_COOKIE_TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * Normalise a reseller code to the canonical uppercase form used in
 * `reseller_promotion_codes.code`. Trim whitespace, uppercase, strip
 * non-alphanumeric.
 */
export function normaliseResellerCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return cleaned || null;
}

/**
 * Extract the raw `?via=…` from a URL search string.
 * Accepts either a URLSearchParams or a raw querystring/URL.
 */
export function extractViaFromSearchParams(input: URLSearchParams | string): string | null {
  const params =
    typeof input === "string"
      ? new URLSearchParams(input.startsWith("?") ? input.slice(1) : input)
      : input;
  return normaliseResellerCode(params.get(VIA_PARAM));
}

/**
 * Client-side helper — read the cached via code from cookie or localStorage.
 * Returns null if neither has it. Safe to call in SSR (returns null).
 */
export function readCachedVia(): string | null {
  if (typeof document === "undefined") return null;

  // Prefer cookie for cross-tab consistency.
  const cookies = document.cookie.split(";");
  for (const raw of cookies) {
    const [k, v] = raw.trim().split("=");
    if (k === VIA_KEY && v) return normaliseResellerCode(decodeURIComponent(v));
  }

  try {
    const ls = window.localStorage.getItem(VIA_KEY);
    return normaliseResellerCode(ls);
  } catch {
    // localStorage may be blocked (private mode, etc.). Not fatal.
    return null;
  }
}

/**
 * Client-side helper — persist a via code to cookie + localStorage.
 * Silently no-ops in SSR context.
 */
export function persistVia(code: string): void {
  const clean = normaliseResellerCode(code);
  if (!clean) return;
  if (typeof document === "undefined") return;

  document.cookie = `${VIA_KEY}=${encodeURIComponent(clean)}; max-age=${VIA_COOKIE_TTL_SECONDS}; path=/; samesite=lax`;

  try {
    window.localStorage.setItem(VIA_KEY, clean);
  } catch {
    // ignore
  }
}

/**
 * Client-side helper — clear the cached via code (customer clicked
 * "Remove code" in onboarding).
 */
export function clearVia(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${VIA_KEY}=; max-age=0; path=/; samesite=lax`;
  try {
    window.localStorage.removeItem(VIA_KEY);
  } catch {
    // ignore
  }
}

/**
 * Server-side helper — parse the `blockid_via` cookie value from a raw
 * `Cookie:` header string. Returns null if absent.
 */
export function extractViaFromCookieHeader(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null;
  for (const raw of cookieHeader.split(";")) {
    const [k, v] = raw.trim().split("=");
    if (k === VIA_KEY && v) return normaliseResellerCode(decodeURIComponent(v));
  }
  return null;
}

// viaClientReferenceId moved to ./attribution-server.ts (server-only)
// so client bundles do not pull node:crypto.
