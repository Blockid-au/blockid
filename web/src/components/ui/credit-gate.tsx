"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, ArrowUpRight, Coins, Sparkles, X } from "lucide-react";
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

  // Prevent background scroll while modal is open.
  React.useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

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
            <Link
              href="/workspace/billing#credits"
              onClick={onClose}
              className="flex items-center justify-center gap-2 w-full h-11 rounded-xl bg-brand-600 text-sm font-bold text-white hover:bg-brand-700 transition-colors"
            >
              <Coins strokeWidth={1.75} className="h-4 w-4" />
              Buy Credits
              <ArrowUpRight strokeWidth={1.75} className="h-3.5 w-3.5" />
            </Link>

            <Link
              href="/workspace/billing"
              onClick={onClose}
              className="flex items-center justify-center gap-2 w-full h-11 rounded-xl border border-surface-200 bg-white text-sm font-semibold text-ink-700 hover:bg-surface-50 transition-colors"
            >
              <Sparkles strokeWidth={1.75} className="h-4 w-4" />
              Upgrade Plan
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
