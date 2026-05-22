"use client";

import { Lock, Sparkles, ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics";

interface RndLockedSectionProps {
  lockedPreview: string;
  lockedSections: string[];
  pageTitle: string;
  potentialSVI?: number;
  currentSVI?: number;
  onUnlock?: () => void;
}

export function RndLockedSection({
  lockedPreview,
  lockedSections,
  pageTitle,
  potentialSVI,
  currentSVI,
  onUnlock,
}: RndLockedSectionProps) {
  return (
    <div className="mt-6 relative">
      {/* Gradient fade from content above */}
      <div className="absolute -top-8 left-0 right-0 h-8 bg-gradient-to-b from-transparent to-white pointer-events-none" />

      {/* Locked content card */}
      <div className="rounded-2xl border border-brand-200/60 bg-gradient-to-b from-brand-50/40 to-white p-6 md:p-8">
        {/* Preview text */}
        <p className="text-sm text-ink-500 italic leading-relaxed mb-5">
          &ldquo;{lockedPreview}&rdquo;
        </p>

        {/* Locked sections list */}
        <div className="mb-6">
          <p className="text-xs uppercase tracking-[0.15em] text-brand-600 font-semibold mb-3">
            Deeper analysis available
          </p>
          <div className="space-y-2">
            {lockedSections.map((section, i) => (
              <div
                key={i}
                className="flex items-center gap-2.5 rounded-lg border border-surface-200 bg-surface-50/50 px-3.5 py-2.5"
              >
                <Lock className="h-3.5 w-3.5 text-brand-400 shrink-0" />
                <span className="text-sm text-ink-700 font-medium">{section}</span>
              </div>
            ))}
          </div>
        </div>

        {/* SVI improvement prediction */}
        {potentialSVI && currentSVI && potentialSVI > currentSVI && (
          <div className="mb-6 rounded-xl bg-emerald-50 border border-emerald-200/60 p-4 flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-emerald-500 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-700">
                Your SVI could reach {potentialSVI}
              </p>
              <p className="text-xs text-emerald-600 mt-0.5">
                Currently {currentSVI} — follow the full roadmap to unlock +{potentialSVI - currentSVI} points
              </p>
            </div>
          </div>
        )}

        {/* CTA */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <Button
            variant="primary"
            size="md"
            className="gap-2"
            onClick={() => {
              trackEvent("report_unlock_click", { page: pageTitle });
              onUnlock?.();
            }}
          >
            Unlock full {pageTitle} analysis
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Link href="/founding-50" className="text-xs text-brand-600 hover:text-brand-700 font-medium">
            Or get unlimited reports — A$49 lifetime
          </Link>
        </div>
      </div>
    </div>
  );
}
