// /signup — real card-required signup page.
//
// Replaces the earlier redirect shim (which forwarded to /auth/login for a
// magic-link) with a first-class Stripe Elements card capture, per the
// 2026-07-24 trial + card-upfront directive (see
// `web/src/lib/plans/trial-copy.ts`).
//
// This is a server component that pre-resolves the trial plans for the
// requested segment so the client form can render the plan picker without a
// round trip. The heavy lifting (Stripe Elements,
// POST /api/auth/register-with-card) lives in `./signup-form.tsx`.
//
// Two variants (T0269, G12 §3c-3):
//   /signup                              → founder ladder (Starter / Growth / Enterprise)
//   /signup?segment=evaluator[&plan=…]   → evaluator ladder (Scout / Firm / Program =
//                                          investor_angel / investor_advisor / investor_vc_small)
// Both are card-required Stripe trials; the plan row's `trial_days` drives
// the length. Allow-lists live in `@/lib/plans/signup-plans` (shared with the
// API route so the two can never drift).

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { pageMetadata } from "@/lib/seo/page-meta";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { signedInSignupRedirect } from "@/lib/plans/signed-in-upgrade";
import { parseBillingInterval } from "@/lib/plans/billing-interval";
import { getPlansCached } from "@/lib/plans-db";
import { EVALUATOR_TRIAL_COPY, TRIAL_COPY, evaluatorTrialLine, formatAud } from "@/lib/plans/trial-copy";
import {
  accountTypeOptionsForSegment,
  evaluatorPlanLabel,
  isSelfServePlan,
  resolvePreferredPlan,
  resolveSignupSegment,
  resolveTrialDays,
  trialPlanIdsForSegment,
} from "@/lib/plans/signup-plans";
import { checkoutReviewStrings } from "@/lib/billing/checkout-review-strings";
import { getMessages } from "@/lib/i18n/t";
import { safeNextPath } from "@/lib/security/safe-redirect";
import { LEGAL_ENTITY_ABN_LABEL, LEGAL_ENTITY } from "@/lib/site/legal-entity";
import { SignupForm, type SignupPlanChoice } from "./signup-form";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = pageMetadata({
  title: "Start your 7-day free trial",
  description: "Create your BlockID account and start a 7-day free trial — score your startup on the Startup Value Index, see a valuation range and next steps. Cancel before Day 8.",
  path: "/signup",
});

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;

  // S31-B (2026-09-13): a signed-in user landing here (the Money Radar tile,
  // a /pricing card, an old campaign link) used to get a fresh registration
  // form that always ended in "An account with this email already exists".
  // They already have the account — send them to Billing with the plan they
  // chose so the click starts a checkout instead of a dead end.
  const existing = await getCurrentUser();
  // G25-D: a signed-in user lands on the review step for the plan (or back
  // on the review that sent them here) — never on a checkout.
  // `?next=` (the review that sent the visitor here) is open-redirect guarded.
  const nextRaw = Array.isArray(sp.next) ? sp.next[0] : sp.next;
  const next = nextRaw ? safeNextPath(nextRaw, "") || null : null;
  if (existing) redirect(next ?? signedInSignupRedirect(sp.plan, sp.interval));

  // `?interval=annual` from a pricing card's Annual toggle (2026-09-16 audit).
  // Honoured per plan below: a rung without an annual Stripe Price is shown
  // — and billed — monthly, never at the annual figure.
  const interval = parseBillingInterval(sp.interval);

  const segment = resolveSignupSegment(sp.segment, sp.plan);
  const preferredPlan = resolvePreferredPlan(segment, sp.plan);
  const isEvaluator = segment === "evaluator";

  // Fetch every trial plan for the segment so the form's picker is a real
  // dropdown rather than a hard-coded price table (env var swaps are picked
  // up). Evaluator rungs render under their public names (Scout / Firm /
  // Program) while the plan row keeps its internal name.
  const plans = await getPlansCached();
  const trialPlans: SignupPlanChoice[] = trialPlanIdsForSegment(segment)
    .map((id) => plans.find((p) => p.id === id))
    // Negotiated tiers (interval = custom) never show as a trial (#17).
    .filter((p): p is NonNullable<typeof p> => Boolean(p) && p!.active && isSelfServePlan(p))
    .map((p) => ({
      id: p.id,
      name: evaluatorPlanLabel(p.id) ?? p.name,
      priceCents: p.price_aud_cents,
      priceDisplay: formatAud(p.price_aud_cents),
      trialDays: resolveTrialDays(p),
      hasStripePrice: Boolean(p.stripe_price_id),
      annualPriceCents: p.annual_price_aud_cents,
      annualPriceDisplay: formatAud(p.annual_price_aud_cents),
      hasAnnualPrice: Boolean(p.stripe_price_id_annual) && p.annual_price_aud_cents > 0,
    }));

  const stripePublishableKey =
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null;

  // G25-D: the card form sits under a Review block; its strings come from
  // the same catalogue keys as /checkout/review.
  const review = checkoutReviewStrings(await getMessages("en"), "en");
  const sellerLine = `${LEGAL_ENTITY.operator} (${LEGAL_ENTITY_ABN_LABEL})`;

  const headline = isEvaluator ? EVALUATOR_TRIAL_COPY.headline : TRIAL_COPY.headline;
  const subheadline = isEvaluator ? EVALUATOR_TRIAL_COPY.subheadline : TRIAL_COPY.subheadline;

  return (
    <main className="flex min-h-svh items-start justify-center bg-surface-sunken px-5 py-12 text-primary">
      <div className="w-full max-w-[520px]">
        <div className="mb-6 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">
            BlockID
          </p>
          <h1 className="mb-1 mt-2 text-[26px] font-semibold tracking-tight text-primary">
            {headline}
          </h1>
          <p className="text-sm text-secondary">
            {subheadline}
          </p>
          {isEvaluator ? (
            <p
              data-testid="evaluator-trial-line"
              className="mt-2.5 text-[13px] font-medium text-secondary"
            >
              {evaluatorTrialLine(trialPlans.find((p) => p.id === preferredPlan)?.trialDays)}
            </p>
          ) : null}
        </div>

        <div className="rounded-2xl border border-line-subtle bg-surface p-6 shadow-1">
          <SignupForm
            segment={segment}
            trialPlans={trialPlans}
            defaultPlanId={preferredPlan}
            interval={interval}
            accountTypeOptions={accountTypeOptionsForSegment(segment)}
            stripePublishableKey={stripePublishableKey}
            review={{
              title: review.signupBlockTitle,
              hint: review.signupBlockHint,
              gstLine: review.gstLine,
              trialLine: review.trialLine,
              renewalLine: review.renewalLine,
              cadenceMonth: review.cadenceMonth,
              cadenceYear: review.cadenceYear,
              dataPrinciple: review.dataPrinciple,
              sellerLine,
            }}
          />
        </div>

        <p className="mt-4 text-center text-[13px] text-secondary">
          Already have an account?{" "}
          <Link
            href={next ? `/auth/login?next=${encodeURIComponent(next)}` : "/auth/login"}
            className="font-medium text-action hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
