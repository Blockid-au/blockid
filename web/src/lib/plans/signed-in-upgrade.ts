// Where a SIGNED-IN user goes when they land on a signup / trial entry point.
//
// S31-B (2026-09-13). Three surfaces sent an existing, onboarded user into a
// registration flow that could not succeed for them:
//   • /pricing "Start trial"  → /onboarding?trial=1&plan=<id> → bounced to
//     /workspace/score (no checkout, no message);
//   • the Money Radar tile → /signup?plan=founder_starter → "An account with
//     this email already exists";
//   • old campaign links to /signup.
// They all resolve here.
//
// G25-D (founder 2026-09-21, review before pay): a priced plan lands on the
// review step (`/checkout/review?plan=…`), where the user reads the order and
// presses Pay / Add card themselves — Billing used to start the Stripe
// checkout on mount for `?plan=`, which was exactly the auto-redirect the
// founder forbade. Free / custom / unknown plans still land on Billing.
//
// Isomorphic and dependency-free (one plans-v2 read) so RSC pages and tests
// can import it.

import { PLANS_V2 } from "@/lib/plans-v2";
import { checkoutReviewHref, type CheckoutEntry } from "@/lib/billing/checkout-review";
import { parseBillingInterval } from "@/lib/plans/billing-interval";

const CHECKOUTABLE = new Set(
  PLANS_V2.filter((p) => p.monthly_aud !== null && p.monthly_aud > 0).map((p) => p.id),
);

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * `/checkout/review?plan=<id>&trial=1[&interval=annual]&entry=…` when the
 * requested plan is a real, priced SKU the checkout route can sell; plain
 * `/workspace/billing` otherwise (free, custom-priced, unknown or missing).
 * Never a marketing page and never Stripe: the user is already a customer
 * and reads the order first.
 */
export function signedInSignupRedirect(
  plan: string | string[] | undefined,
  interval?: string | string[] | undefined,
  entry: CheckoutEntry = "signup",
): string {
  const id = first(plan)?.trim();
  if (id && CHECKOUTABLE.has(id)) {
    // `?interval=annual` rides along so the review bills the cadence the
    // pricing card showed (2026-09-16 audit).
    return checkoutReviewHref({ plan: id, interval: parseBillingInterval(interval), trial: true, entry });
  }
  return "/workspace/billing";
}
