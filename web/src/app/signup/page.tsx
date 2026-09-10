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
import Link from "next/link";
import { getPlansCached } from "@/lib/plans-db";
import { EVALUATOR_TRIAL_COPY, TRIAL_COPY, TRIAL_DAYS, formatAud } from "@/lib/plans/trial-copy";
import {
  accountTypeOptionsForSegment,
  evaluatorPlanLabel,
  isSelfServePlan,
  resolvePreferredPlan,
  resolveSignupSegment,
  resolveTrialDays,
  trialPlanIdsForSegment,
} from "@/lib/plans/signup-plans";
import { SignupForm, type SignupPlanChoice } from "./signup-form";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: `Start your ${TRIAL_DAYS}-day trial — BlockID`,
  description: TRIAL_COPY.headline,
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
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
    }));

  const stripePublishableKey =
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null;

  const headline = isEvaluator ? EVALUATOR_TRIAL_COPY.headline : TRIAL_COPY.headline;
  const subheadline = isEvaluator ? EVALUATOR_TRIAL_COPY.subheadline : TRIAL_COPY.subheadline;

  return (
    <main
      style={{
        minHeight: "100svh",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "48px 20px",
        background: "#0B1220",
        color: "#F8FAFC",
      }}
    >
      <div style={{ width: "100%", maxWidth: 520 }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <p
            style={{
              margin: 0,
              fontSize: 11,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "#3B7DD8",
              fontWeight: 600,
            }}
          >
            BlockID
          </p>
          <h1
            style={{
              margin: "8px 0 4px 0",
              fontSize: 26,
              fontWeight: 600,
              letterSpacing: "-0.01em",
            }}
          >
            {headline}
          </h1>
          <p style={{ margin: 0, color: "#94A3B8", fontSize: 14 }}>
            {subheadline}
          </p>
          {isEvaluator ? (
            <p
              data-testid="evaluator-trial-line"
              style={{ margin: "10px 0 0 0", color: "#CBD5E1", fontSize: 13, fontWeight: 500 }}
            >
              {EVALUATOR_TRIAL_COPY.trial_line}
            </p>
          ) : null}
        </div>

        <div
          style={{
            background: "#0F172A",
            border: "1px solid #1F2A44",
            borderRadius: 16,
            padding: 24,
          }}
        >
          <SignupForm
            segment={segment}
            trialPlans={trialPlans}
            defaultPlanId={preferredPlan}
            accountTypeOptions={accountTypeOptionsForSegment(segment)}
            stripePublishableKey={stripePublishableKey}
          />
        </div>

        <p
          style={{
            marginTop: 16,
            textAlign: "center",
            fontSize: 13,
            color: "#94A3B8",
          }}
        >
          Already have an account?{" "}
          <Link
            href="/auth/login"
            style={{ color: "#3B7DD8", textDecoration: "none", fontWeight: 500 }}
          >
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
