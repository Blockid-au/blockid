"use client";

import * as React from "react";
import Link from "next/link";
import {
  Check,
  CreditCard,
  Crown,
  ExternalLink,
  Loader2,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Plan } from "@/lib/plans";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BillingClientProps {
  currentPlanId: string | null;
  planStartedAt: string | null;
  hasStripeCustomer: boolean;
  plans: Plan[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPrice(cents: number, cadence: Plan["cadence"]): string {
  const dollars = cents / 100;
  const fmt = new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(dollars);

  switch (cadence) {
    case "free":
      return "Free";
    case "monthly":
      return `${fmt}/mo`;
    case "yearly":
      return `${fmt}/yr`;
    case "once":
      return `${fmt} once`;
  }
}

function cadenceLabel(cadence: Plan["cadence"]): string {
  switch (cadence) {
    case "free":
      return "Free forever";
    case "monthly":
      return "Billed monthly";
    case "yearly":
      return "Billed annually";
    case "once":
      return "One-time payment";
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BillingClient({
  currentPlanId,
  planStartedAt,
  hasStripeCustomer,
  plans,
}: BillingClientProps) {
  const [loadingAction, setLoadingAction] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [showDowngradeConfirm, setShowDowngradeConfirm] = React.useState<
    string | null
  >(null);

  const activePlan = plans.find((p) => p.id === currentPlanId) ?? null;
  const effectivePlanId = currentPlanId ?? "free";

  // Ordered tiers for upgrade/downgrade logic (index = rank)
  const tierRank: Record<string, number> = {
    free: 0,
    founding50: 1,
    founder: 2,
    growth: 3,
    pilot: 4,
    accelerator: 5,
  };
  const currentRank = tierRank[effectivePlanId] ?? 0;

  // -----------------------------------------------------------------------
  // Actions
  // -----------------------------------------------------------------------

  async function handleManageBilling() {
    setLoadingAction("portal");
    setError(null);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const json = await res.json();
      if (json.ok && json.url) {
        window.location.href = json.url;
        return; // redirect happening
      }
      setError(json.reason ?? "Failed to open billing portal.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleCheckout(planId: string) {
    setLoadingAction(planId);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planId }),
      });
      const json = await res.json();
      if (json.ok && json.url) {
        window.location.href = json.url;
        return;
      }
      setError(json.reason ?? "Failed to start checkout.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoadingAction(null);
    }
  }

  function handleDowngrade(planId: string) {
    setShowDowngradeConfirm(planId);
  }

  function confirmDowngrade() {
    if (showDowngradeConfirm) {
      // For downgrades, redirect to portal where the user can manage their sub
      void handleManageBilling();
      setShowDowngradeConfirm(null);
    }
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="space-y-8">
      {/* Error banner */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ---- Current Plan Card ---- */}
      <section className="rounded-2xl border border-surface-200 bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-surface-200 flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-brand-50 flex items-center justify-center">
            <Crown strokeWidth={1.75} className="h-4.5 w-4.5 text-brand-600" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-ink-800">
              Current Plan
            </h2>
            <p className="text-xs text-ink-600">
              {activePlan
                ? cadenceLabel(activePlan.cadence)
                : "You are on the free plan"}
            </p>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Plan name + price */}
          <div className="flex items-baseline justify-between">
            <div>
              <span className="text-lg font-bold text-ink-800">
                {activePlan?.name ?? "Free"}
              </span>
              {activePlan && (
                <span className="ml-3 text-sm font-medium text-ink-600">
                  {formatPrice(activePlan.price, activePlan.cadence)}
                </span>
              )}
            </div>
            {planStartedAt && (
              <span className="text-xs text-ink-600">
                Active since{" "}
                {new Date(planStartedAt).toLocaleDateString("en-AU", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            )}
          </div>

          {/* Features */}
          <ul className="space-y-2">
            {(
              activePlan?.features ??
              plans.find((p) => p.id === "free")?.features ??
              []
            ).map((f) => (
              <li key={f} className="flex items-start gap-2.5 text-sm">
                <Check
                  strokeWidth={2}
                  className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5"
                />
                <span className="text-ink-700">{f}</span>
              </li>
            ))}
          </ul>

          {/* CTA */}
          <div className="flex items-center gap-3 pt-1">
            {effectivePlanId === "free" ? (
              <Link
                href="/#pricing"
                className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
              >
                <Sparkles strokeWidth={1.75} className="h-4 w-4" />
                Upgrade
              </Link>
            ) : hasStripeCustomer ? (
              <button
                type="button"
                onClick={handleManageBilling}
                disabled={loadingAction === "portal"}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-surface-200 bg-white px-5 text-sm font-medium text-ink-700 hover:bg-surface-50 transition-colors cursor-pointer",
                  loadingAction === "portal" && "opacity-60 cursor-wait",
                )}
              >
                {loadingAction === "portal" ? (
                  <Loader2
                    strokeWidth={1.75}
                    className="h-4 w-4 animate-spin"
                  />
                ) : (
                  <ExternalLink strokeWidth={1.75} className="h-4 w-4" />
                )}
                Manage Billing
              </button>
            ) : null}
          </div>
        </div>
      </section>

      {/* ---- Available Plans Grid ---- */}
      <section>
        <h2 className="text-base font-semibold text-ink-800 mb-4">
          Available Plans
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => {
            const isCurrent = plan.id === effectivePlanId;
            const planRank = tierRank[plan.id] ?? 0;
            const isUpgrade = planRank > currentRank;
            const isDowngrade = planRank < currentRank;

            return (
              <div
                key={plan.id}
                className={cn(
                  "rounded-2xl border bg-white shadow-sm flex flex-col overflow-hidden transition-shadow",
                  isCurrent
                    ? "border-brand-300 ring-2 ring-brand-100"
                    : "border-surface-200 hover:shadow-md",
                )}
              >
                {/* Header */}
                <div className="px-5 pt-5 pb-3">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-sm font-semibold text-ink-800">
                      {plan.name}
                    </h3>
                    {isCurrent && (
                      <span className="text-[10px] uppercase tracking-wider font-medium text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full border border-brand-200">
                        Current
                      </span>
                    )}
                  </div>
                  <p className="text-lg font-bold text-ink-800">
                    {formatPrice(plan.price, plan.cadence)}
                  </p>
                  <p className="text-xs text-ink-600 mt-0.5">
                    {cadenceLabel(plan.cadence)}
                  </p>
                </div>

                {/* Features */}
                <ul className="px-5 pb-4 space-y-1.5 flex-1">
                  {plan.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-2 text-xs text-ink-700"
                    >
                      <Check
                        strokeWidth={2}
                        className="h-3.5 w-3.5 shrink-0 text-emerald-500 mt-0.5"
                      />
                      {f}
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <div className="px-5 pb-5">
                  {isCurrent ? (
                    <div className="h-9 flex items-center justify-center rounded-[10px] bg-surface-100 text-sm font-medium text-ink-600">
                      Your current plan
                    </div>
                  ) : plan.cadence === "free" ? (
                    isDowngrade ? (
                      <button
                        type="button"
                        onClick={() => handleDowngrade(plan.id)}
                        className="w-full h-9 rounded-[10px] border border-surface-200 text-sm font-medium text-ink-700 hover:bg-surface-50 transition-colors cursor-pointer"
                      >
                        Downgrade
                      </button>
                    ) : null
                  ) : isUpgrade ? (
                    <button
                      type="button"
                      onClick={() => handleCheckout(plan.id)}
                      disabled={loadingAction === plan.id}
                      className={cn(
                        "w-full h-9 rounded-[10px] bg-brand-600 text-sm font-semibold text-white hover:bg-brand-700 transition-colors cursor-pointer flex items-center justify-center gap-1.5",
                        loadingAction === plan.id && "opacity-60 cursor-wait",
                      )}
                    >
                      {loadingAction === plan.id ? (
                        <Loader2
                          strokeWidth={1.75}
                          className="h-4 w-4 animate-spin"
                        />
                      ) : (
                        <CreditCard strokeWidth={1.75} className="h-4 w-4" />
                      )}
                      Upgrade
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleDowngrade(plan.id)}
                      className="w-full h-9 rounded-[10px] border border-surface-200 text-sm font-medium text-ink-700 hover:bg-surface-50 transition-colors cursor-pointer"
                    >
                      Downgrade
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ---- Downgrade Confirmation Dialog ---- */}
      {showDowngradeConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => setShowDowngradeConfirm(null)}
          />
          <div className="relative bg-white rounded-2xl border border-surface-200 shadow-xl max-w-sm w-full p-6 space-y-4">
            <h3 className="text-base font-semibold text-ink-800">
              Confirm Downgrade
            </h3>
            <p className="text-sm text-ink-600">
              Are you sure you want to downgrade your plan? You may lose access
              to features available on your current plan. You will be redirected
              to the billing portal to make changes.
            </p>
            <div className="flex items-center gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowDowngradeConfirm(null)}
                className="h-9 px-4 rounded-[10px] border border-surface-200 text-sm font-medium text-ink-700 hover:bg-surface-50 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDowngrade}
                disabled={loadingAction === "portal"}
                className={cn(
                  "h-9 px-4 rounded-[10px] bg-red-600 text-sm font-semibold text-white hover:bg-red-700 transition-colors cursor-pointer flex items-center gap-1.5",
                  loadingAction === "portal" && "opacity-60 cursor-wait",
                )}
              >
                {loadingAction === "portal" && (
                  <Loader2
                    strokeWidth={1.75}
                    className="h-4 w-4 animate-spin"
                  />
                )}
                Confirm Downgrade
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
