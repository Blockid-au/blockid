// <DowngradeOffer> — save-offer shown before hard cancel (T-0417).
//
// The exit-survey reason drives which offer we show:
//   too_expensive       → 50% off Starter for 3 months (DOWNGRADE_STARTER50)
//   not_using           → pause billing 30 days
//   missing_features    → book a call with product
//   found_alternative   → 30% off keep-plan for 3 months (COMEBACK30)
//   temporary_pause     → pause billing 30 days
//   other               → 30% off keep-plan for 3 months
//
// Accepting or declining posts to /api/stripe/cancel with the chosen
// path; the caller finalises the cancellation on a decline.

"use client";

import * as React from "react";

import type { CancelReason } from "./exit-survey";

type OfferKind =
  | { kind: "downgrade_50"; label: string; blurb: string; coupon: "DOWNGRADE_STARTER50" }
  | { kind: "keep_30"; label: string; blurb: string; coupon: "COMEBACK30" }
  | { kind: "pause_30d"; label: string; blurb: string }
  | { kind: "book_call"; label: string; blurb: string; href: string };

function offerFor(reason: CancelReason): OfferKind {
  switch (reason) {
    case "too_expensive":
      return {
        kind: "downgrade_50",
        label: "Try Starter at 50% off for 3 months",
        blurb: "A$14.50/mo instead of A$29. Keep your data and cap table — just fewer credits.",
        coupon: "DOWNGRADE_STARTER50",
      };
    case "not_using":
    case "temporary_pause":
      return {
        kind: "pause_30d",
        label: "Pause billing for 30 days",
        blurb: "No charge for a month. Everything stays where you left it.",
      };
    case "missing_features":
      return {
        kind: "book_call",
        label: "Book a 15-minute call with product",
        blurb: "Tell us what's missing. If we can build it, we will. Meanwhile, stay on your current plan free for 30 days.",
        href: "https://cal.com/blockid/product",
      };
    case "found_alternative":
    case "other":
    default:
      return {
        kind: "keep_30",
        label: "Stay with 30% off for 3 months",
        blurb: "Same plan, 30% cheaper for the next 3 months. No commitment beyond that.",
        coupon: "COMEBACK30",
      };
  }
}

export interface DowngradeOfferProps {
  reason: CancelReason;
  onAccept: (payload: { coupon?: string; kind: string; href?: string }) => void;
  onDecline: () => void;
  submitting?: boolean;
}

export function DowngradeOffer({ reason, onAccept, onDecline, submitting }: DowngradeOfferProps) {
  const offer = offerFor(reason);

  const accept = () => {
    const payload: { coupon?: string; kind: string; href?: string } = { kind: offer.kind };
    if ("coupon" in offer) payload.coupon = offer.coupon;
    if ("href" in offer) payload.href = offer.href;
    onAccept(payload);
  };

  return (
    <div className="space-y-4 rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm dark:border-amber-800 dark:bg-amber-950/40">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
          Save-offer for you
        </p>
        <h3 className="mt-1 text-base font-semibold text-amber-900 dark:text-amber-100">
          {offer.label}
        </h3>
        <p className="mt-1 text-amber-800 dark:text-amber-200">{offer.blurb}</p>
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onDecline}
          disabled={submitting}
          className="rounded-lg border border-amber-300 bg-white px-4 py-2 font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-60 dark:border-amber-700 dark:bg-transparent dark:text-amber-100 dark:hover:bg-amber-900/50"
        >
          No thanks — cancel anyway
        </button>
        <button
          type="button"
          onClick={accept}
          disabled={submitting}
          className="rounded-lg bg-amber-600 px-4 py-2 font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
        >
          {submitting ? "Applying…" : "Yes, apply this offer"}
        </button>
      </div>
    </div>
  );
}
