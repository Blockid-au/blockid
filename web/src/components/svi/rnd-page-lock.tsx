"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

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
            Unlock — A$1
          </Button>
          <Link href="/founding-50">
            <Button variant="secondary" size="md">
              Get Founding 100 — A$1 (unlimited)
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
