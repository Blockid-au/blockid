// <UpgradeBanner> — inline trigger-driven CTA above content (T-0412).
//
// Same hook as UpgradeModal, but renders as a sticky strip. Use for
// low-friction triggers (day5/6 trial reminders); modal is for hard
// gate hits.

"use client";

import * as React from "react";
import Link from "next/link";
import { X, Sparkles } from "lucide-react";

import { useUpgradePrompt } from "@/hooks/useUpgradePrompt";
import { UPGRADE_COPY } from "./upgrade-copy";

export function UpgradeBanner() {
  const { trigger, accept, dismiss } = useUpgradePrompt();
  if (!trigger) return null;
  const copy = UPGRADE_COPY[trigger];

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-3 border-b border-brand-500/40 bg-gradient-to-r from-brand-700 to-violet-700 px-4 py-2.5 text-white"
    >
      <Sparkles className="h-4 w-4 shrink-0" strokeWidth={1.75} />
      <p className="flex-1 text-xs leading-snug sm:text-sm">
        <span className="font-semibold">{copy.headline}.</span>{" "}
        <span className="opacity-90">{copy.body}</span>
      </p>
      <Link
        href={`/pricing?plan=${copy.suggestedPlan}`}
        onClick={() => accept(copy.suggestedPlan)}
        className="shrink-0 rounded-lg bg-white/20 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/30"
      >
        {copy.primaryCta}
      </Link>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded-full p-1 text-white/70 hover:bg-white/20 hover:text-white"
      >
        <X className="h-3.5 w-3.5" strokeWidth={1.75} />
      </button>
    </div>
  );
}
