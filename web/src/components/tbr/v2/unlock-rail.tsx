"use client";

// G16-B — the ONE unlock rail on a free Trusted Business Report. Rendered by
// <TbrReportV2> exactly once (after the first locked chapter), it states the
// one-off price from the pricing source of truth and hands off to the
// existing quote-then-pay flow (<ReportPaywallGate>: credits + A$ shown, an
// explicit confirm, then Stripe). It never charges anything itself.
//
// Three modes:
//   buy        free founder → "Unlock … — A$3 (one-off)" button → onUnlock()
//   included   plan carries the report → "Included in your plan — generate"
//   purchased  a paid report_orders row exists → "Open your full report"

import { Lock, Check, ArrowRight } from "lucide-react";
import { reportOrderPath } from "@/lib/paywall/report-delivery";
import { trustReportPriceLabel } from "@/lib/pricing/trust-report-price";

export type TbrUnlockMode = "buy" | "included" | "purchased";

export interface TbrUnlockRailProps {
  mode: TbrUnlockMode;
  /** Dimension chapters in the full report (the "what you get" count). */
  chapterCount: number;
  /** buy: opens the confirm-before-charge modal. */
  onUnlock?: () => void;
  /** purchased: the paid order to open. */
  orderId?: string | null;
  /** included: where the plan-included report is generated (defaults to the deck analyser). */
  generateHref?: string;
}

export const TBR_UNLOCK_RAIL_TESTID = "tbr-unlock-rail";

export function tbrUnlockHeadline(mode: TbrUnlockMode): string {
  const price = trustReportPriceLabel();
  if (mode === "included") return "The full Trusted Business Report is included in your plan";
  if (mode === "purchased") return "Your full Trusted Business Report is ready";
  return `Unlock the full Trusted Business Report — ${price} (one-off)`;
}

export function TbrUnlockRail({ mode, chapterCount, onUnlock, orderId, generateHref = "/workspace/raise/deck" }: TbrUnlockRailProps) {
  const price = trustReportPriceLabel();
  const perks = [
    `All ${chapterCount} dimension chapters in full — evidence tables, criterion cards, next actions`,
    "Valuation range with the three methods behind it",
    "90-day action plan, phase gates and the grants you qualify for",
    "PDF export + a live share link for investors",
  ];
  return (
    <aside
      data-testid={TBR_UNLOCK_RAIL_TESTID}
      data-tbr-unlock={mode}
      aria-label="Unlock the full report"
      className="sticky top-16 z-10 rounded-2xl border border-brand-300 bg-brand-50/95 p-5 shadow-lg backdrop-blur dark:border-brand-700 dark:bg-brand-950/90 print:hidden"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <p className="flex items-center gap-2 text-base font-bold text-ink-900 dark:text-ink-50">
            <Lock className="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300" strokeWidth={2} aria-hidden="true" />
            {tbrUnlockHeadline(mode)}
          </p>
          <ul className="grid gap-1 text-xs text-ink-700 dark:text-ink-200 sm:grid-cols-2">
            {perks.map((p) => (
              <li key={p} className="flex items-start gap-1.5">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-600 dark:text-brand-300" strokeWidth={2.5} aria-hidden="true" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex shrink-0 flex-col items-stretch gap-1.5 md:w-64">
          {mode === "buy" ? (
            <>
              <button
                type="button"
                onClick={onUnlock}
                data-testid="tbr-unlock-cta"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
              >
                Unlock for {price}
                <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              </button>
              <p className="text-center text-[11px] text-ink-600 dark:text-ink-300">One-off inc. GST. You confirm the exact price and credit cost before anything is charged.</p>
            </>
          ) : mode === "included" ? (
            <>
              <a
                href={generateHref}
                data-testid="tbr-unlock-cta"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
              >
                Included in your plan — generate
                <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              </a>
              <p className="text-center text-[11px] text-ink-600 dark:text-ink-300">No charge — your plan carries the full report.</p>
            </>
          ) : (
            <a
              href={orderId ? reportOrderPath(orderId) : "/workspace/reports/order"}
              data-testid="tbr-unlock-cta"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
            >
              Open your full report
              <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            </a>
          )}
        </div>
      </div>
    </aside>
  );
}
