"use client";

import * as React from "react";
import { Coins, Sparkles, Tag, TrendingUp, X, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Feature label + description map
// ---------------------------------------------------------------------------

const FEATURE_INFO: Record<string, { label: string; description: string; costLabel: string }> = {
  svi_analysis: {
    label: "SVI Analysis",
    description: "AI-powered startup value index analysis of your business idea.",
    costLabel: "A$0.50",
  },
  svi_report: {
    label: "SVI Report",
    description: "Full 10-page AI-generated startup analysis report with actionable insights.",
    costLabel: "A$0.50",
  },
  rnd_report: {
    label: "R&D Report",
    description: "Standard 10-page R&D report with SSE streaming analysis.",
    costLabel: "A$1.00",
  },
  rnd_deep_dive: {
    label: "Deep Dive Report",
    description: "Extended R&D analysis with detailed competitor profiles and growth tactics.",
    costLabel: "A$1.50",
  },
  term_sheet: {
    label: "Term Sheet AI",
    description: "AI-assisted term sheet generation and analysis for fundraising.",
    costLabel: "A$1.00",
  },
  research: {
    label: "Competitive Research",
    description: "AI-powered market and competitive landscape research for your startup.",
    costLabel: "A$0.50",
  },
  ai_score: {
    label: "AI Score",
    description: "Enhanced AI scoring for your startup across multiple dimensions.",
    costLabel: "A$0.25",
  },
  modular_report: {
    label: "Modular Report",
    description: "Custom AI report with your chosen sections.",
    costLabel: "Varies",
  },
};

function getFeatureInfo(feature: string) {
  return (
    FEATURE_INFO[feature] ?? {
      label: feature.replace(/_/g, " "),
      description: "This feature requires credits to use.",
      costLabel: "Varies",
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

  const [buyLoading, setBuyLoading] = React.useState<string | false>(false);
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

  // Reset state when modal closes.
  React.useEffect(() => {
    if (!isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional reset on close
      setBuyLoading(false); setPlanLoading(false); setErrorMsg(""); setCouponCode(""); setCouponState("idle"); setCouponMsg("");
    }
  }, [isOpen]);

  /** Buy a credit pack via /api/credits (authenticated checkout). */
  const handleBuyPack = async (amount: number) => {
    setBuyLoading(String(amount));
    setErrorMsg("");
    try {
      const res = await fetch("/api/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      const data = await res.json();
      if (data.ok && data.url) {
        window.location.href = data.url;
      } else if (data.ok && data.method === "direct") {
        // Dev fallback — credits granted directly; close the gate.
        onClose();
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
          {/* Icon — use a friendly Sparkles instead of a warning triangle */}
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 border border-brand-200">
            <Sparkles strokeWidth={1.75} className="h-7 w-7 text-brand-600" />
          </div>

          {/* Heading */}
          <h3 className="text-center text-xl font-bold text-ink-900">
            Unlock {info.label}
          </h3>

          {/* Value proposition */}
          <p className="mt-2 text-center text-sm text-ink-500 leading-relaxed">
            {info.description}
          </p>

          {/* Balance display */}
          <div className="mt-5 rounded-xl border border-surface-200 bg-surface-50 p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-ink-600">Credits remaining</span>
              <span
                className={cn(
                  "font-bold",
                  balance === 0 ? "text-red-600" : "text-amber-600",
                )}
              >
                <Coins strokeWidth={1.75} className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />
                {Number.isInteger(balance) ? balance : balance.toFixed(2)} credit{balance !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="text-ink-600">This analysis costs</span>
              <span className="font-bold text-ink-800">
                just {info.costLabel}
              </span>
            </div>
          </div>

          {/* Value messaging */}
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-emerald-100 bg-emerald-50/50 px-4 py-3">
            <TrendingUp strokeWidth={1.75} className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
            <p className="text-xs text-emerald-700 leading-relaxed">
              Each analysis gives you a detailed AI assessment across 8 dimensions,
              evidence-based scoring, and actionable next steps to increase your
              startup valuation.
            </p>
          </div>

          {/* Credit pack options */}
          <div className="mt-6 space-y-2.5">
            <CreditGatePackCard
              credits={10}
              price="A$5"
              label="10 Credits"
              desc="A$0.50 per credit"
              onClick={() => handleBuyPack(10)}
              highlight={false}
              loading={buyLoading === "10"}
              disabled={!!buyLoading || planLoading}
            />
            <CreditGatePackCard
              credits={25}
              price="A$9"
              label="25 Credits"
              desc="A$0.36 per credit — save 28%"
              onClick={() => handleBuyPack(25)}
              highlight={true}
              badge="Most Popular"
              loading={buyLoading === "25"}
              disabled={!!buyLoading || planLoading}
            />
            <CreditGatePackCard
              credits={50}
              price="A$15"
              label="50 Credits"
              desc="A$0.30 per credit — save 40%"
              onClick={() => handleBuyPack(50)}
              highlight={false}
              loading={buyLoading === "50"}
              disabled={!!buyLoading || planLoading}
            />
          </div>

          {/* Founding 50 lifetime CTA */}
          <div className="mt-4 rounded-xl border border-brand-200 bg-gradient-to-r from-brand-50 to-violet-50 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-100 shrink-0">
                <Zap strokeWidth={1.75} className="h-4.5 w-4.5 text-brand-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-brand-800">
                  Founding 50 Lifetime Deal
                </p>
                <p className="text-xs text-brand-600 mt-0.5 leading-relaxed">
                  Get 100 credits + full platform access for A$49 one-time. Limited to 50 spots.
                </p>
                <button
                  type="button"
                  onClick={handlePlanCheckout}
                  disabled={!!buyLoading || planLoading}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {planLoading ? (
                    <span className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                      Redirecting...
                    </span>
                  ) : (
                    <>
                      Get Founding 50 for A$49
                      <Sparkles strokeWidth={1.75} className="h-3 w-3" />
                    </>
                  )}
                </button>
              </div>
            </div>
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

// ---------------------------------------------------------------------------
// CreditGatePackCard — inline credit pack option for the credit gate modal.
// ---------------------------------------------------------------------------

function CreditGatePackCard({
  credits,
  price,
  label,
  desc,
  onClick,
  highlight,
  badge,
  loading,
  disabled,
}: {
  credits: number;
  price: string;
  label: string;
  desc: string;
  onClick: () => void;
  highlight: boolean;
  badge?: string;
  loading: boolean;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "relative flex items-center justify-between rounded-2xl border p-4 transition-all hover:shadow-md w-full text-left cursor-pointer disabled:opacity-50",
        highlight
          ? "border-brand-500 bg-brand-50 shadow-sm"
          : "border-surface-200 bg-white hover:border-brand-300",
      )}
    >
      {badge && (
        <span className="absolute -top-2.5 left-4 rounded-full bg-brand-600 px-2.5 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider">
          {badge}
        </span>
      )}
      <div>
        <p className="text-sm font-bold text-ink-900">{label}</p>
        <p className="text-xs text-ink-500 mt-0.5">{desc}</p>
      </div>
      <div className="text-right shrink-0 ml-3">
        {loading ? (
          <span className="h-4 w-4 rounded-full border-2 border-brand-300/30 border-t-brand-600 animate-spin inline-block" />
        ) : (
          <>
            <p className="text-lg font-bold text-brand-600">{price}</p>
            <p className="text-[10px] text-ink-500">
              {credits} credit{credits > 1 ? "s" : ""}
            </p>
          </>
        )}
      </div>
    </button>
  );
}
