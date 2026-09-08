// The signup gate — who is allowed to start an anonymous /analyze run.
//
// WHY A GATE AT ALL
// -----------------
// Run 1 is completely unwalled: no email, no card, no account. That is
// deliberate and must stay that way. The finished report is the product's
// distribution channel — founders forward it to investors — so friction in
// front of the first run suppresses conversion AND reach at the same time.
//
// From run 2 we ask for an email BEFORE the pipeline starts, not after. A
// full multi-agent run is A$0.40–1.20 of real model spend. Asking afterwards
// means paying that for somebody who is about to bounce; asking beforehand
// costs nothing but a visitor who has never paid us anything and has already
// seen a complete analysis for free.
//
// It is an ACCOUNT wall, not a paywall. Nothing here charges anything, and no
// copy anywhere may imply that it does.
//
// THE COUNTING WINDOW
// -------------------
// Prior runs are counted over a ROLLING 30 DAYS, not all time.
//
// All-time is one fewer moving part, and it is the wrong call: a founder who
// ran an idea past us in March and comes back in July hits a wall with no
// memory of ever having used the site. From their side that is
// indistinguishable from "this site demands an account to do anything" — the
// exact impression the unwalled first run exists to avoid. Thirty days is
// long enough that nobody working through one idea over a fortnight can loop
// the free run, and short enough that a genuine return visit gets the same
// welcome the first one did.
//
// The window is also what makes the wall recoverable without support: worst
// case a visitor waits, and we never have to explain a permanent block.
//
// THIS MODULE IS PURE
// -------------------
// No database, no cookies, no Next.js. The route feeds it a count and a
// session flag; every branch is unit-testable and the same decision can be
// replayed in a test in microseconds. The I/O lives in `store.ts`.

/** Free anonymous runs inside the window before the gate fires. */
export const FREE_ANON_RUNS = 1;

/** Rolling window over which prior anonymous runs are counted. */
export const ANON_RUN_WINDOW_DAYS = 30;

export const ANON_RUN_WINDOW_MS = ANON_RUN_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/** Machine-readable discriminator returned to the client when the gate fires. */
export const SIGNUP_REQUIRED = "signup_required";

export interface SignupGateInput {
  /** True when a session user was resolved. Signed-in callers are never gated. */
  authenticated: boolean;
  /** Prior runs by this anon key inside the window. */
  priorRuns: number;
  /** `?tier=` the visitor arrived on. */
  tier?: "free" | "paid" | null;
  /**
   * Whether this submission could actually be sold as the A$3 guest report.
   * `/api/guest-analysis/create-order` only accepts a pitch file or a site
   * URL, so a typed idea on `?tier=paid` has no SKU and stays on the free
   * path — and therefore stays behind the gate.
   */
  paidSellable?: boolean;
}

export type SignupGateDecision =
  | {
      allow: true;
      /** Why it was allowed — logged, and asserted on in tests. */
      reason: "authenticated" | "first_run" | "paid_guest";
    }
  | {
      allow: false;
      reason: typeof SIGNUP_REQUIRED;
      priorRuns: number;
      windowDays: number;
    };

/**
 * Decide whether an intake run may proceed.
 *
 * Order matters:
 *   1. Signed in — always allowed. Their own credit rules apply downstream
 *      and are none of this module's business.
 *   2. A paying guest — `?tier=paid` with an input that has a real A$3 SKU.
 *      Someone about to hand us money must never be told to make an account
 *      first. The tier flag comes from the client and cannot be verified
 *      server-side, so it is narrowed to submissions that are genuinely
 *      sellable and the anonymous write rate limit still applies underneath.
 *   3. Under the free allowance — allowed.
 *   4. Otherwise — gated, and the caller must spend nothing.
 */
export function decideSignupGate(input: SignupGateInput): SignupGateDecision {
  if (input.authenticated) return { allow: true, reason: "authenticated" };
  if (input.tier === "paid" && input.paidSellable) {
    return { allow: true, reason: "paid_guest" };
  }
  const prior = Number.isFinite(input.priorRuns)
    ? Math.max(0, Math.floor(input.priorRuns))
    : 0;
  if (prior < FREE_ANON_RUNS) return { allow: true, reason: "first_run" };
  return {
    allow: false,
    reason: SIGNUP_REQUIRED,
    priorRuns: prior,
    windowDays: ANON_RUN_WINDOW_DAYS,
  };
}

/** The cutoff timestamp the count query filters `created_at` against. */
export function anonRunWindowStart(now: number = Date.now()): string {
  return new Date(now - ANON_RUN_WINDOW_MS).toISOString();
}

/**
 * Could this submission be sold as the A$3 guest report?
 *
 * Mirrors `guestInputTypeFor` in the client without needing the classified
 * IntakeResult — which is the whole point, since classifying is the work the
 * gate exists to avoid paying for. A file or an http(s) URL can be sold; a
 * typed idea cannot.
 */
export function isPaidSellableInput(input: {
  hasFile?: boolean;
  url?: string | null;
  text?: string | null;
}): boolean {
  if (input.hasFile) return true;
  const candidate = (input.url ?? input.text ?? "").trim();
  if (!candidate) return false;
  try {
    const u = new URL(candidate);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
