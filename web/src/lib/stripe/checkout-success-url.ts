// Helpers for the Stripe-hosted Checkout return path.
//
// Iteration-6 task #2: after Step 5 (payment) of the v2 onboarding wizard,
// Stripe-hosted Checkout redirects the user to /checkout/success?plan=X.
// That page is a marketing "thank-you" surface — it never re-enters the
// wizard, so Step 6 ("Create your first startup", shipped in 41ab0cfc) was
// unreachable in production for the Stripe-hosted branch. Only the
// client_secret branch advances (via `dispatch({type:"NEXT"})` in
// components/onboarding/step-payment.tsx).
//
// Fix: when the checkout is initiated *from* the onboarding wizard, the
// wizard passes `origin: "onboarding"` in the POST body. The checkout route
// then stamps `&onboarding=1` on the success_url so /checkout/success can
// detect the return and bounce the user back into the wizard at Step 6.
//
// Standalone checkout callers (upgrade prompt, add-on, billing page,
// founding-50 form, landing pricing) do NOT set `origin` — their success
// URL stays the marketing thank-you page.

/**
 * Build the `success_url` we hand to Stripe Checkout Session creation.
 *
 * @param siteUrl  Absolute origin, e.g. https://blockid.au. No trailing slash.
 * @param planId   The wizard/plan id, e.g. "founding50".
 * @param origin   Where the checkout was initiated from. Currently only
 *                 "onboarding" is meaningful — everything else falls through
 *                 to the standalone marketing thank-you URL.
 */
export function buildCheckoutSuccessUrl(
  siteUrl: string,
  planId: string,
  origin?: string | null,
): string {
  const base = `${siteUrl}/checkout/success?plan=${encodeURIComponent(planId)}`;
  return origin === "onboarding" ? `${base}&onboarding=1` : base;
}

/**
 * Decide whether the /checkout/success page should immediately redirect the
 * user back into the onboarding wizard at Step 6 ("Create your first
 * startup"). Only true when *both* conditions hold:
 *   1. The return URL carries `onboarding=1` (i.e. the checkout was
 *      initiated from the wizard, not from a standalone upgrade/add-on).
 *   2. The user is authenticated — otherwise we let them see the CTA that
 *      prompts them to sign in first.
 */
export function shouldReturnToOnboarding(
  onboardingParam: string | undefined | null,
  isAuthenticated: boolean,
): boolean {
  return onboardingParam === "1" && isAuthenticated;
}

/** Destination for the onboarding return jump — always Step 6. */
export const ONBOARDING_RETURN_STEP_URL = "/onboarding?step=6";
