// <UpgradeModal> — trigger-driven upgrade CTA (T-0412).
//
// Consumes the useUpgradePrompt() hook. Shows a focus-trapped dialog
// with primary + secondary CTAs; the primary is a LINK to the review step
// (`/checkout/review?plan=…&entry=upgrade_modal`) — G25-D: the user reads
// the order there and presses Pay; nothing here posts to a checkout route.

"use client";

import * as React from "react";
import Link from "next/link";
import { X } from "lucide-react";

import { checkoutReviewHref } from "@/lib/billing/checkout-review";

import { useUpgradePrompt } from "@/hooks/useUpgradePrompt";
import { UPGRADE_COPY } from "./upgrade-copy";
import { PLANS_V2 } from "@/lib/plans-v2";
import { formatGstInclusiveAud } from "@/lib/gst";

export function UpgradeModal() {
  const { trigger, accept, dismiss } = useUpgradePrompt();
  const dialogRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!trigger) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    dialog?.focus();

    const focusableSelector =
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        dismiss();
        return;
      }
      if (e.key !== "Tab" || !dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(focusableSelector),
      ).filter((el) => el.offsetParent !== null || el === dialog);
      if (focusable.length === 0) {
        e.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || active === dialog)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previouslyFocused?.focus?.();
    };
  }, [trigger, dismiss]);

  if (!trigger) return null;
  const copy = UPGRADE_COPY[trigger];

  // The review step handles signed-out visitors itself (sign-up / sign-in
  // with `next=` back to the review), so the link is the same for everyone.
  const reviewHref = checkoutReviewHref({ plan: copy.suggestedPlan, trial: true, entry: "upgrade_modal" });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) dismiss();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="upgrade-modal-title"
        tabIndex={-1}
        className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl outline-none dark:bg-neutral-900"
      >
        <button
          type="button"
          onClick={dismiss}
          aria-label="Close"
          className="absolute right-3 top-3 rounded-full p-1 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          <X className="h-4 w-4" strokeWidth={1.75} />
        </button>
        {copy.urgency ? (
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
            {copy.urgency}
          </p>
        ) : null}
        <h2 id="upgrade-modal-title" className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
          {copy.headline}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
          {copy.body}
        </p>
        {(() => {
          // QA-3 P2: GST-inclusive amount before the Stripe redirect.
          const plan = PLANS_V2.find((p) => p.id === copy.suggestedPlan);
          const monthly = plan?.monthly_aud;
          if (typeof monthly !== "number" || monthly <= 0) return null;
          return (
            <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400" data-testid="gst-line">
              {plan?.name}: {formatGstInclusiveAud(Math.round(monthly * 100))} per month, 7-day free trial, cancel any time.
            </p>
          );
        })()}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {copy.secondaryCta ? (
            <button
              type="button"
              onClick={dismiss}
              className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              {copy.secondaryCta}
            </button>
          ) : null}
          <Link
            href={reviewHref}
            onClick={() => accept(copy.suggestedPlan)}
            data-testid="upgrade-modal-primary"
            className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            {copy.primaryCta}
          </Link>
        </div>
      </div>
    </div>
  );
}
