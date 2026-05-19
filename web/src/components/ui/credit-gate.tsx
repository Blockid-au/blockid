"use client";

import * as React from "react";
import { AlertTriangle, Coins, Sparkles, Tag, X } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Feature label + description map
// ---------------------------------------------------------------------------

const FEATURE_INFO: Record<string, { label: string; description: string }> = {
  svi_analysis: {
    label: "SVI Analysis",
    description: "AI-powered startup value index analysis of your business idea.",
  },
  svi_report: {
    label: "SVI Report",
    description: "Full 10-page AI-generated startup analysis report with actionable insights.",
  },
  term_sheet: {
    label: "Term Sheet AI",
    description: "AI-assisted term sheet generation and analysis for fundraising.",
  },
  research: {
    label: "Competitive Research",
    description: "AI-powered market and competitive landscape research for your startup.",
  },
  ai_score: {
    label: "AI Score",
    description: "Enhanced AI scoring for your startup across multiple dimensions.",
  },
};

function getFeatureInfo(feature: string) {
  return (
    FEATURE_INFO[feature] ?? {
      label: feature.replace(/_/g, " "),
      description: "This feature requires credits to use.",
    }
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CreditGateProps {
  isOpen: boolean;
  onClose: () => void;
  feature: string;
  cost: number;
  balance: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CreditGate({
  isOpen,
  onClose,
  feature,
  cost,
  balance,
}: CreditGateProps) {
  const info = getFeatureInfo(feature);
  const shortfall = cost - balance;

  const [buyLoading, setBuyLoading] = React.useState(false);
  const [planLoading, setPlanLoading] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState("");
  const [couponCode, setCouponCode] = React.useState("");
  const [couponState, setCouponState] = React.useState<
    "idle" | "validating" | "success" | "error"
  >("idle");
  const [couponMsg, setCouponMsg] = React.useState("");

  // Prevent background scroll while modal is open.
  React.useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  // Reset state when modal opens/closes.
  React.useEffect(() => {
    if (!isOpen) {
      setBuyLoading(false);
      setPlanLoading(false);
      setErrorMsg("");
      setCouponCode("");
      setCouponState("idle");
      setCouponMsg("");
    }
  }, [isOpen]);

  /** Buy 1 Credit via /api/stripe/analysis (guest checkout). */
  const handleBuyCredit = async () => {
    setBuyLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/stripe/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.ok && data.url) {
        window.location.href = data.url;
      } else {
        setErrorMsg(data.reason || "Could not start checkout. Please try again.");
      }
    } catch {
      setErrorMsg("Network error. Please try again.");
    } finally {
      setBuyLoading(false);
    }
  };

  /** Get Founder Plan via /api/stripe/checkout. */
  const handlePlanCheckout = async () => {
    setPlanLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "founding50" }),
      });
      if (res.status === 401) {
        window.location.href = "/auth/login?plan=founding50";
        return;
      }
      const data = await res.json();
      if (data.ok && data.url) {
        window.location.href = data.url;
      } else {
        setErrorMsg(data.reason || "Could not start checkout. Please try again.");
      }
    } catch {
      setErrorMsg("Network error. Please try again.");
    } finally {
      setPlanLoading(false);
    }
  };

  /** Validate coupon code. */
  const handleCouponValidate = async () => {
    const code = couponCode.trim();
    if (!code) return;
    setCouponState("validating");
    setCouponMsg("");
    try {
      const res = await fetch("/api/coupon/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (data.ok && data.discount_pct === 100) {
        setCouponState("success");
        setCouponMsg("Free access granted!");
        setTimeout(() => onClose(), 1200);
      } else if (data.ok) {
        setCouponState("idle");
        setCouponMsg(
          `${data.discount_pct}% discount applied. Proceed to checkout to use it.`,
        );
      } else {
        setCouponState("error");
        setCouponMsg(data.reason || "Invalid coupon code.");
      }
    } catch {
      setCouponState("error");
      setCouponMsg("Could not validate coupon. Please try again.");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink-900/60 backdrop-blur-sm animate-fade-in overflow-y-auto py-8">
      <div className="relative mx-4 w-full max-w-md rounded-2xl border border-surface-200 bg-white shadow-2xl">
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 h-8 w-8 flex items-center justify-center rounded-full text-ink-400 hover:text-ink-700 hover:bg-surface-100 cursor-pointer transition-colors"
          aria-label="Close"
        >
          <X strokeWidth={1.75} className="h-4 w-4" />
        </button>

        <div className="px-6 py-8">
          {/* Icon */}
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 border border-amber-200">
            <AlertTriangle strokeWidth={1.75} className="h-7 w-7 text-amber-600" />
          </div>

          {/* Heading */}
          <h3 className="text-center text-xl font-bold text-ink-900">
            Not Enough Credits
          </h3>
          <p className="mt-2 text-center text-sm text-ink-500 leading-relaxed">
            You need more credits to use{" "}
            <span className="font-semibold text-ink-700">{info.label}</span>.
          </p>

          {/* Balance vs Cost */}
          <div className="mt-6 rounded-xl border border-surface-200 bg-surface-50 p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-ink-600">Your balance</span>
              <span
                className={cn(
                  "font-bold",
                  balance === 0 ? "text-red-600" : "text-amber-600",
                )}
              >
                <Coins strokeWidth={1.75} className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />
                {balance} credit{balance !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="text-ink-600">Required</span>
              <span className="font-bold text-ink-800">
                {cost} credit{cost !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="mt-2 pt-2 border-t border-surface-200 flex items-center justify-between text-sm">
              <span className="text-ink-600">Shortfall</span>
              <span className="font-bold text-red-600">
                {shortfall} credit{shortfall !== 1 ? "s" : ""}
              </span>
            </div>
          </div>

          {/* Feature description */}
          <p className="mt-4 text-xs text-ink-500 text-center leading-relaxed">
            {info.description}
          </p>

          {/* CTAs */}
          <div className="mt-6 space-y-3">
            <button
              type="button"
              onClick={handleBuyCredit}
              disabled={buyLoading || planLoading}
              className="flex items-center justify-center gap-2 w-full h-11 rounded-xl bg-brand-600 text-sm font-bold text-white hover:bg-brand-700 transition-colors cursor-pointer disabled:opacity-50"
            >
              {buyLoading ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Redirecting...
                </span>
              ) : (
                <>
                  <Coins strokeWidth={1.75} className="h-4 w-4" />
                  Buy 1 Credit &mdash; A$1
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handlePlanCheckout}
              disabled={buyLoading || planLoading}
              className="flex items-center justify-center gap-2 w-full h-11 rounded-xl border border-surface-200 bg-white text-sm font-semibold text-ink-700 hover:bg-surface-50 transition-colors cursor-pointer disabled:opacity-50"
            >
              {planLoading ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 rounded-full border-2 border-ink-300/30 border-t-ink-600 animate-spin" />
                  Redirecting...
                </span>
              ) : (
                <>
                  <Sparkles strokeWidth={1.75} className="h-4 w-4" />
                  Get Founder Plan &mdash; A$49 (unlimited)
                </>
              )}
            </button>
          </div>

          {/* Error message */}
          {errorMsg && (
            <p className="mt-3 text-center text-xs text-red-500">{errorMsg}</p>
          )}

          {/* Coupon input */}
          <div className="mt-5">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Tag strokeWidth={1.75} className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
                <input
                  type="text"
                  value={couponCode}
                  onChange={(e) => {
                    setCouponCode(e.target.value);
                    if (couponState === "error") {
                      setCouponState("idle");
                      setCouponMsg("");
                    }
                  }}
                  placeholder="Enter coupon code"
                  className="h-10 w-full rounded-xl border border-surface-300 bg-surface-50 pl-9 pr-3 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 transition-colors"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleCouponValidate();
                    }
                  }}
                />
              </div>
              <button
                type="button"
                onClick={handleCouponValidate}
                disabled={couponState === "validating" || !couponCode.trim()}
                className="h-10 px-4 rounded-xl border border-surface-300 bg-white text-sm font-medium text-ink-700 hover:bg-surface-100 transition-colors cursor-pointer disabled:opacity-50"
              >
                {couponState === "validating" ? "..." : "Apply"}
              </button>
            </div>
            {couponMsg && (
              <p
                className={cn(
                  "mt-2 text-center text-xs font-medium",
                  couponState === "success"
                    ? "text-green-600"
                    : couponState === "error"
                      ? "text-red-500"
                      : "text-brand-600",
                )}
              >
                {couponMsg}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
