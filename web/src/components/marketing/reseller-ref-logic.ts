// Pure-logic helpers for the marketing `?ref=<CODE>` capture flow.
//
// Split from the client React component (`./reseller-ref-capture.tsx`) so
// unit tests can exercise the branch matrix (first-touch, override, cookie
// already set, invalid format) without spinning up jsdom / a DOM mock.
//
// Task M1 (v3 reseller-attribution upgrade). See docs/plans/reseller-module-plan.md
// § C.2 (redemption UX) and § A.4 (first-touch attribution). Kept intentionally
// framework-agnostic — no `document.cookie` writes here; the client component
// consumes `decideRefCapture()` and translates the plan into DOM effects.

/** Regex Marketing agreed on for reseller codes: 2-6 uppercase letters
 * followed by optional digits (e.g. `IFV`, `IFV20`, `PARTNER1`). */
export const RESELLER_CODE_RE = /^[A-Z]{2,6}\d*$/;

export const REF_PARAM = "ref";
export const OVERRIDE_PARAM = "override_ref";

/** 90 days — task M1 explicit override of the 30-day TTL used by the
 *  legacy `?via=` capture (see `web/src/lib/reseller/attribution.ts`). */
export const REF_COOKIE_TTL_SECONDS = 90 * 24 * 60 * 60;

/** Cookie key — must stay in sync with the `blockid_via` cookie every
 *  server-side reseller helper (checkout, register-with-card, webhook)
 *  already reads. */
export const REF_COOKIE_KEY = "blockid_via";

export interface DecideRefInput {
  /** Raw value of the `?ref=` query parameter, may be null. */
  refParam: string | null;
  /** Raw value of the `?override_ref=` query parameter — treated as truthy
   *  only when strictly equal to "true" (case-insensitive). */
  overrideParam: string | null;
  /** Existing value of the `blockid_via` cookie, or null when unset. */
  existingCookie: string | null;
}

export type DecideRefOutcome =
  | { action: "write"; code: string; ga4: { event: "reseller_ref_captured"; code: string } }
  | { action: "skip"; reason:
      | "no_ref_param"
      | "invalid_format"
      | "same_as_cookie"
      | "first_touch_wins" };

/**
 * Decide what the client capture component should do on mount.
 *
 * Order of guards:
 *   1. `?ref=` absent → skip (nothing to capture).
 *   2. Normalised value fails the RESELLER_CODE_RE contract → skip.
 *   3. Cookie already carries the SAME code → skip (idempotent mount).
 *   4. Cookie carries a DIFFERENT code AND override flag is not set →
 *      skip (first-touch attribution wins).
 *   5. Otherwise → write.
 */
export function decideRefCapture(input: DecideRefInput): DecideRefOutcome {
  if (!input.refParam) return { action: "skip", reason: "no_ref_param" };

  const normalised = normaliseRefCode(input.refParam);
  if (!normalised) return { action: "skip", reason: "invalid_format" };

  const override = isOverride(input.overrideParam);
  const existing = normaliseRefCode(input.existingCookie);

  if (existing && existing === normalised) {
    return { action: "skip", reason: "same_as_cookie" };
  }
  if (existing && !override) {
    return { action: "skip", reason: "first_touch_wins" };
  }

  return {
    action: "write",
    code: normalised,
    ga4: { event: "reseller_ref_captured", code: normalised },
  };
}

/**
 * Uppercase + strip non-alphanumerics, then enforce the reseller-code
 * regex. Returns null when the input can't be coerced to a valid code —
 * callers treat null as "skip this capture".
 */
export function normaliseRefCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = String(raw).trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!cleaned) return null;
  return RESELLER_CODE_RE.test(cleaned) ? cleaned : null;
}

function isOverride(raw: string | null | undefined): boolean {
  if (!raw) return false;
  return String(raw).trim().toLowerCase() === "true";
}

/**
 * Compose the `Set-Cookie`-style string the client component writes to
 * `document.cookie`. Server-rendered pages never call this (root layout
 * mounts a client component); kept here so both the component and the
 * test suite share a single serializer.
 */
export function buildRefCookieString(
  code: string,
  opts: { isSecure: boolean; domain?: string | null } = { isSecure: true },
): string {
  const parts: string[] = [
    `${REF_COOKIE_KEY}=${encodeURIComponent(code)}`,
    `max-age=${REF_COOKIE_TTL_SECONDS}`,
    "path=/",
    "samesite=lax",
  ];
  if (opts.domain) parts.push(`domain=${opts.domain}`);
  if (opts.isSecure) parts.push("secure");
  return parts.join("; ");
}
