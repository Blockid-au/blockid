// <UpgradeModal> — trigger-driven upgrade CTA (T-0412).
//
// Consumes the useUpgradePrompt() hook. Shows a focus-trapped dialog
// with primary + secondary CTAs; primary POSTs to /api/stripe/checkout
// with the suggested plan and redirects to Stripe.

"use client";

import * as React from "react";
import { X } from "lucide-react";

import { useUpgradePrompt } from "@/hooks/useUpgradePrompt";
import { UPGRADE_COPY } from "./upgrade-copy";

export function UpgradeModal() {
  const { trigger, accept, dismiss } = useUpgradePrompt();
  const [busy, setBusy] = React.useState(false);
  const dialogRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!trigger) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previouslyFocused?.focus?.();
    };
  }, [trigger, dismiss]);

  if (!trigger) return null;
  const copy = UPGRADE_COPY[trigger];

  const onPrimary = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: copy.suggestedPlan }),
      });
      if (res.status === 401) {
        window.location.href = `/auth/login?next=/pricing?plan=${copy.suggestedPlan}`;
        return;
      }
      const data = await res.json();
      accept(copy.suggestedPlan);
      if (data?.url) window.location.href = data.url;
    } catch {
      // fall back to pricing page
      window.location.href = "/pricing";
    } finally {
      setBusy(false);
    }
  };

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
          <button
            type="button"
            onClick={onPrimary}
            disabled={busy}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {busy ? "Loading…" : copy.primaryCta}
          </button>
        </div>
      </div>
    </div>
  );
}
