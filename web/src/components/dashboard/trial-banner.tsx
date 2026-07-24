// Dashboard trial banner — shown for users with an active 7-day trial.
//
// Reads canonical copy from @/lib/plans/trial-copy so wording stays in
// lock-step with signup, checkout, PDFs and drip emails.
//
// Mount at the top of the dashboard shell; the component self-hides
// when trialEndAt is null/past. The Cancel button hits
// /api/billing/cancel-trial which immediately drops the trial + Stripe
// subscription and downgrades the user (see route for details).

"use client";

import { useState } from "react";
import { TRIAL_COPY, TRIAL_DAYS } from "@/lib/plans/trial-copy";

export interface TrialBannerProps {
  /** ISO timestamp when trial auto-converts. Null = no trial → banner hidden. */
  trialEndAt: string | null;
  /** ISO timestamp when trial started (defaults to trialEndAt - 7d if missing). */
  trialStartedAt?: string | null;
  /** Display price for the plan the trial converts to (e.g. "A$29/mo"). */
  priceDisplay: string;
  /** Optional plan display name for the CTA row. */
  planName?: string;
}

export default function TrialBanner({
  trialEndAt,
  trialStartedAt,
  priceDisplay,
  planName,
}: TrialBannerProps) {
  const [cancelling, setCancelling] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!trialEndAt || dismissed) return null;
  const endMs = new Date(trialEndAt).getTime();
  if (!Number.isFinite(endMs) || endMs <= Date.now()) return null;

  const startMs = trialStartedAt
    ? new Date(trialStartedAt).getTime()
    : endMs - TRIAL_DAYS * 24 * 60 * 60 * 1000;
  const totalMs = endMs - startMs;
  const elapsedMs = Date.now() - startMs;
  const dayOfTrial = Math.min(
    TRIAL_DAYS,
    Math.max(1, Math.ceil((elapsedMs / totalMs) * TRIAL_DAYS)),
  );

  const trialEndDate = new Date(trialEndAt).toLocaleDateString("en-AU", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  async function handleCancel() {
    if (!confirm("Cancel your trial now? You'll lose access immediately.")) return;
    setCancelling(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/cancel-trial", { method: "POST" });
      const json = (await res.json()) as { ok?: boolean; reason?: string };
      if (!res.ok || !json.ok) {
        setError(json.reason ?? "Cancel failed. Please try again.");
        setCancelling(false);
        return;
      }
      setDismissed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setCancelling(false);
    }
  }

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        background: "#0F172A",
        border: "1px solid #1F2A44",
        borderRadius: 12,
        padding: "14px 18px",
        margin: "0 0 16px 0",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        flexWrap: "wrap",
      }}
    >
      <div style={{ minWidth: 240, flex: "1 1 320px" }}>
        <div style={{ color: "#F8FAFC", fontWeight: 600, fontSize: 14 }}>
          {TRIAL_COPY.banner_headline(dayOfTrial)}
          {planName ? ` — ${planName}` : ""}
        </div>
        <div style={{ color: "#94A3B8", fontSize: 13, marginTop: 4 }}>
          {TRIAL_COPY.banner_subline(trialEndDate, priceDisplay)}
        </div>
        {error ? (
          <div style={{ color: "#F87171", fontSize: 12, marginTop: 6 }}>
            {error}
          </div>
        ) : null}
      </div>
      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        <a
          href="/settings/billing"
          style={{
            background: "#3B7DD8",
            color: "#0B1220",
            fontWeight: 600,
            textDecoration: "none",
            padding: "8px 14px",
            borderRadius: 8,
            fontSize: 13,
          }}
        >
          Manage billing
        </a>
        <button
          type="button"
          onClick={handleCancel}
          disabled={cancelling}
          style={{
            background: "transparent",
            color: "#94A3B8",
            border: "1px solid #1F2A44",
            padding: "8px 14px",
            borderRadius: 8,
            fontSize: 13,
            cursor: cancelling ? "wait" : "pointer",
          }}
        >
          {cancelling ? "Cancelling…" : "Cancel trial"}
        </button>
      </div>
    </div>
  );
}
