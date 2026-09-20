"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RND_REPORT_CREDITS } from "@/lib/credits-public";
import { PLANS_V2 } from "@/lib/plans-v2";

// G18-A (2026-09-19): the secondary button sold "Founding 100 — A$5 (50
// credits, lifetime)" and linked /founding-50 — a promo closed 2026-09-01 and
// a route that 301s to /pricing. It now names the Starter rung (no price
// typed; the card shows it). The unlock price is RND_REPORT_CREDITS
// (credits-public mirror of FEATURE_COSTS.rnd_report).
const STARTER_NAME = PLANS_V2.find((p) => p.id === "founder_starter")?.name ?? "Starter";

interface RndPageLockProps {
  children: React.ReactNode;
  onUnlock?: () => void;
}

export function RndPageLock({ children, onUnlock }: RndPageLockProps) {
  return (
    <div className="relative">
      {/* Blurred preview */}
      <div className="max-h-[120px] overflow-hidden blur-sm opacity-50 pointer-events-none select-none">
        {children}
      </div>

      {/* Overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-transparent via-white/80 to-white rounded-2xl px-6 py-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 mb-4">
          <Lock className="h-6 w-6 text-brand-600" />
        </div>
        <p className="text-lg font-semibold text-ink-800 mb-2 text-center">
          Unlock Full Report
        </p>
        <p className="text-sm text-ink-500 mb-6 text-center max-w-sm">
          Get the complete 10-page analysis including business model, competition,
          financials, and actionable recommendations.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Button variant="primary" size="md" onClick={onUnlock}>
            Unlock — {RND_REPORT_CREDITS} credit{RND_REPORT_CREDITS === 1 ? "" : "s"}
          </Button>
          <Link href="/pricing#tier-starter">
            <Button variant="secondary" size="md">
              See the {STARTER_NAME} plan
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
