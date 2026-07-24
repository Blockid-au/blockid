// /signup — real card-required signup page.
//
// Replaces the earlier redirect shim (which forwarded to /auth/login for a
// magic-link) with a first-class Stripe Elements card capture, per the
// 2026-07-24 trial + card-upfront directive (see
// `web/src/lib/plans/trial-copy.ts`).
//
// This is a server component that pre-resolves the four founder trial plans
// so the client form can render the plan picker without a round trip. The
// heavy lifting (Stripe Elements, POST /api/auth/register-with-card) lives
// in `./signup-form.tsx`.

import type { Metadata } from "next";
import Link from "next/link";
import { getPlansCached } from "@/lib/plans-db";
import { TRIAL_COPY, TRIAL_DAYS, formatAud } from "@/lib/plans/trial-copy";
import { SignupForm, type SignupPlanChoice } from "./signup-form";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: `Start your ${TRIAL_DAYS}-day trial — BlockID`,
  description: TRIAL_COPY.headline,
};

const FOUNDER_TRIAL_PLAN_IDS = [
  "founder_starter",
  "founder_growth",
  "founder_scale",
  "founder_enterprise",
] as const;

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const preferredPlan =
    typeof sp.plan === "string" && FOUNDER_TRIAL_PLAN_IDS.includes(sp.plan as typeof FOUNDER_TRIAL_PLAN_IDS[number])
      ? sp.plan
      : "founder_starter";

  // Fetch every founder trial plan so the form's picker is a real dropdown
  // rather than a hard-coded price table (env var swaps are picked up).
  const plans = await getPlansCached();
  const trialPlans: SignupPlanChoice[] = FOUNDER_TRIAL_PLAN_IDS
    .map((id) => plans.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p) && p!.active)
    .map((p) => ({
      id: p.id,
      name: p.name,
      priceCents: p.price_aud_cents,
      priceDisplay: formatAud(p.price_aud_cents),
      trialDays: p.trial_days || TRIAL_DAYS,
      hasStripePrice: Boolean(p.stripe_price_id),
    }));

  const stripePublishableKey =
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null;

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
            {TRIAL_COPY.headline}
          </h1>
          <p style={{ margin: 0, color: "#94A3B8", fontSize: 14 }}>
            {TRIAL_COPY.subheadline}
          </p>
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
            trialPlans={trialPlans}
            defaultPlanId={preferredPlan}
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
