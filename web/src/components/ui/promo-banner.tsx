"use client";

import * as React from "react";
import Link from "next/link";
import { Sparkles, X } from "lucide-react";

const PROMO_DEADLINE = new Date("2026-07-01T00:00:00+10:00");
const DISMISS_KEY = "blockid_promo_dismissed";

function useCountdown(target: Date) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const diff = target.getTime() - now;
  if (diff <= 0) return null;
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  return { days, hours };
}

export function PromoBanner() {
  const [dismissed, setDismissed] = React.useState(true); // start hidden to avoid flash
  const countdown = useCountdown(PROMO_DEADLINE);

  React.useEffect(() => {
    const d = localStorage.getItem(DISMISS_KEY);
    // Show again after 24h if dismissed
    if (d && Date.now() - parseInt(d, 10) < 86_400_000) return;
    if (new Date() < PROMO_DEADLINE) setDismissed(false);
  }, []);

  if (dismissed || !countdown) return null;

  const dismiss = () => {
    setDismissed(true);
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  };

  return (
    <div className="relative bg-gradient-to-r from-brand-600 via-brand-500 to-emerald-500 text-white px-4 py-2.5 text-center text-sm">
      <div className="flex items-center justify-center gap-2 flex-wrap">
        <Sparkles strokeWidth={1.75} className="h-4 w-4 shrink-0" />
        <span className="font-medium">
          Early Bird Special — SVI Analysis for just <span className="font-bold">A$0.50</span>
          <span className="opacity-80"> (normally A$25)</span>
        </span>
        <span className="hidden sm:inline opacity-60">|</span>
        <span className="font-mono text-xs bg-white/20 rounded px-2 py-0.5">
          {countdown.days}d {countdown.hours}h left
        </span>
        <Link
          href="/score"
          className="inline-flex items-center gap-1 rounded-full bg-white text-brand-700 px-3 py-0.5 text-xs font-bold hover:bg-brand-50 transition-colors"
        >
          Start Free →
        </Link>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-white/60 hover:text-white transition-colors"
      >
        <X strokeWidth={2} className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
