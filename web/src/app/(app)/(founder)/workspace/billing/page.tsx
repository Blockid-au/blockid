import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { PageTracker } from "@/components/analytics/page-tracker";
import { buildPlansFromConfig } from "@/lib/plans";
import { getPlatformConfig } from "@/lib/platform-config";
import { ADDON_PRICE_IDS } from "@/lib/stripe";
import { isWholesaleProvisionedFounder } from "@/lib/stripe/portal-gate";
import { BillingClient } from "./billing-client";
import { billingPlansFor } from "./billing-plans";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { loadBillingSubscription } from "@/lib/billing/subscription.server";

export const metadata: Metadata = {
  title: "Billing & Subscription",
  description: "Manage your BlockID plan, view features, and update payment details.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/billing");
  const sp = await searchParams;
  const requestedPlan = typeof sp.plan === "string" ? sp.plan : null;

  const isSandbox = await getCurrentProjectIsSandbox();

  // Load plan_started_at and stripe_customer_id from the DB (not on the
  // AppUser type, so we query directly).
  let planStartedAt: string | null = null;
  let hasStripeCustomer = false;

  const [cfg, sb, isWholesaleProvisioned, billing] = await Promise.all([
    getPlatformConfig(),
    Promise.resolve(getSupabaseAdmin()),
    // D3-CISO-06: wholesale-provisioned founders cannot open the Stripe
    // portal (shared reseller Customer object). The button becomes an
    // explanation tooltip in the client render — matches the 403 the
    // /api/stripe/portal route would otherwise return.
    isWholesaleProvisionedFounder(user.id),
    // G18-D: the live subscription (Stripe first, mirror fallback) for the
    // cancel / resume section and the trial-truth line. Never throws.
    loadBillingSubscription(user.id).catch((err) => {
      console.warn("[blockid:billing] subscription load failed", err instanceof Error ? err.message : String(err));
      return null;
    }),
  ]);
  // S31-B (2026-09-13): the grid reads the v2 ladder (Free / Starter A$29 /
  // Growth A$69) from plans-v2. The legacy catalogue is passed only so a
  // grandfathered `growth` / `founding50` subscriber's Current Plan card can
  // still name the plan they are on.
  // `?plan=` (signed-in bounce from /signup, /pricing, /onboarding) may ask
  // for a rung on another ladder — a founder starting an evaluator trial.
  // The grid then shows that ladder so the client's auto-checkout has a row.
  const plans = billingPlansFor(user.plan, requestedPlan);
  const grandfatheredPlans = buildPlansFromConfig(cfg);

  if (sb) {
    const { data: row } = await sb
      .from("app_users")
      .select("plan_started_at, stripe_customer_id")
      .eq("id", user.id)
      .maybeSingle();

    if (row) {
      planStartedAt = row.plan_started_at ?? null;
      hasStripeCustomer = Boolean(row.stripe_customer_id);
    }
  }

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <PageTracker page="billing" />
      <div className="p-6 max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-ink-800">
            Billing &amp; Subscription
          </h1>
          <p className="text-sm text-ink-700 mt-1">
            Manage your plan, view features, and update payment details.
          </p>
        </div>

        <Suspense fallback={null}>
          <BillingClient
            currentPlanId={user.plan}
            planStartedAt={planStartedAt}
            hasStripeCustomer={hasStripeCustomer}
            isWholesaleProvisioned={isWholesaleProvisioned}
            plans={plans}
            grandfatheredPlans={grandfatheredPlans}
            shareMgmtAddonPriceIds={{
              monthly: ADDON_PRICE_IDS.share_management_monthly,
              annual: ADDON_PRICE_IDS.share_management_annual,
            }}
            subscription={billing?.view}
            subscriptionPlanLabel={billing?.planLabel ?? null}
          />
        </Suspense>
      </div>
    </WorkspaceLayout>
  );
}
