import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { PLANS } from "@/lib/plans";
import { BillingClient } from "./billing-client";

export const metadata: Metadata = {
  title: "Billing & Subscription",
  description: "Manage your BlockID plan, view features, and update payment details.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/billing");

  // Load plan_started_at and stripe_customer_id from the DB (not on the
  // AppUser type, so we query directly).
  let planStartedAt: string | null = null;
  let hasStripeCustomer = false;

  const sb = getSupabaseAdmin();
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
    <WorkspaceLayout user={user}>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-ink-800">
            Billing &amp; Subscription
          </h1>
          <p className="text-sm text-ink-700 mt-1">
            Manage your plan, view features, and update payment details.
          </p>
        </div>

        <BillingClient
          currentPlanId={user.plan}
          planStartedAt={planStartedAt}
          hasStripeCustomer={hasStripeCustomer}
          plans={PLANS}
        />
      </div>
    </WorkspaceLayout>
  );
}
