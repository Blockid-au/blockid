// Where a SIGNED-IN user goes when they land on a signup / trial entry point.
//
// S31-B (2026-09-13). Three surfaces sent an existing, onboarded user into a
// registration flow that could not succeed for them:
//   • /pricing "Start trial"  → /onboarding?trial=1&plan=<id> → bounced to
//     /workspace/score (no checkout, no message);
//   • the Money Radar tile → /signup?plan=founder_starter → "An account with
//     this email already exists";
//   • old campaign links to /signup.
// They all resolve here: Billing, carrying the plan so the page starts the
// Stripe checkout for it (billing-client.tsx reads ?plan=).
//
// Isomorphic and dependency-free (one plans-v2 read) so RSC pages and tests
// can import it.

import { PLANS_V2 } from "@/lib/plans-v2";

const CHECKOUTABLE = new Set(
  PLANS_V2.filter((p) => p.monthly_aud !== null && p.monthly_aud > 0).map((p) => p.id),
);

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * `/workspace/billing?plan=<id>` when the requested plan is a real, priced
 * SKU the checkout route can sell; plain `/workspace/billing` otherwise
 * (free, custom-priced, unknown or missing). Never a marketing page: the
 * user is already a customer.
 */
export function signedInSignupRedirect(plan: string | string[] | undefined): string {
  const id = first(plan)?.trim();
  if (id && CHECKOUTABLE.has(id)) {
    return `/workspace/billing?plan=${encodeURIComponent(id)}`;
  }
  return "/workspace/billing";
}
