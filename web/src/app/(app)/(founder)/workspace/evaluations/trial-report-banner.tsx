"use client";

// TrialReportBanner — /workspace/evaluations header strip for an evaluator
// whose subscription is still `trialing` (G12 §3b, S7-C):
//
//   Trial: 5 days left · 1 full Trust BizReport included (0/1 used) ·
//   Scout continues at A$79/mo on Thu 17 Sep unless you cancel   [Manage billing]
//
// The data is `ReportQuota.trial` from lib/evaluations/report-quota.ts
// (status + trial_end mirrored from Stripe into subscription_trial_state),
// so the banner and the report dialog can never disagree about what is
// included. "Manage billing" opens the existing Stripe Billing Portal
// (POST /api/stripe/portal) — the same button as /workspace/billing.
// Renders nothing when not trialing.

import * as React from "react";
import { Loader2 } from "lucide-react";
import type { ReportTrial } from "@/lib/evaluations/report-quota";
import { PLANS_V2 } from "@/lib/plans-v2";
import { evaluatorPlanLabel } from "@/lib/plans/signup-plans";

export interface TrialReportBannerCopy {
  daysLeft: number;
  used: number;
  allowance: number;
  planLabel: string;
  monthlyAud: number | null;
  endDate: string;
  /** The three "·"-joined segments, in order. */
  segments: [string, string, string];
  text: string;
}

export function trialDaysLeft(endsAt: string | null, now: Date = new Date()): number {
  if (!endsAt) return 0;
  const ms = Date.parse(endsAt) - now.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.ceil(ms / 86_400_000);
}

export function formatTrialEndDate(endsAt: string | null): string {
  if (!endsAt) return "the end of your trial";
  const d = new Date(endsAt);
  if (Number.isNaN(d.getTime())) return "the end of your trial";
  // Assembled from parts ("Thu 17 Sep") — en-AU/en-GB short months drift
  // between ICU versions ("Sep" vs "Sept"), en-US parts do not.
  const parts = new Intl.DateTimeFormat("en-US", { weekday: "short", day: "numeric", month: "short", timeZone: "Australia/Sydney" }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("weekday")} ${get("day")} ${get("month")}`.trim();
}

function monthlyPriceFor(planId: string | null): number | null {
  if (!planId) return null;
  const plan = PLANS_V2.find((p) => p.id === planId);
  return typeof plan?.monthly_aud === "number" ? plan.monthly_aud : null;
}

/** Pure copy builder — exported so the page test can pin days / used / date. */
export function buildTrialReportBannerCopy(trial: ReportTrial, now: Date = new Date()): TrialReportBannerCopy {
  const daysLeft = trialDaysLeft(trial.ends_at, now);
  const used = Math.min(trial.used, trial.allowance);
  const planLabel = evaluatorPlanLabel(trial.plan_id) ?? "Your plan";
  const monthlyAud = monthlyPriceFor(trial.plan_id);
  const endDate = formatTrialEndDate(trial.ends_at);
  const reports = `${trial.allowance} full Trust BizReport${trial.allowance === 1 ? "" : "s"}`;
  const segments: [string, string, string] = [
    `Trial: ${daysLeft} day${daysLeft === 1 ? "" : "s"} left`,
    `${reports} included (${used}/${trial.allowance} used)`,
    monthlyAud != null
      ? `${planLabel} continues at A$${monthlyAud}/mo on ${endDate} unless you cancel`
      : `${planLabel} continues on ${endDate} unless you cancel`,
  ];
  return { daysLeft, used, allowance: trial.allowance, planLabel, monthlyAud, endDate, segments, text: segments.join(" · ") };
}

export interface TrialReportBannerProps {
  trial: ReportTrial | null | undefined;
  /** Live "used" from the client after a run (overrides trial.used). */
  used?: number | null;
  now?: Date;
}

export function TrialReportBanner({ trial, used = null, now }: TrialReportBannerProps): React.ReactElement | null {
  const [opening, setOpening] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  if (!trial?.active) return null;
  const copy = buildTrialReportBannerCopy({ ...trial, used: used ?? trial.used }, now);
  if (copy.daysLeft <= 0) return null;

  async function handleManageBilling(): Promise<void> {
    if (opening) return;
    setOpening(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const json = (await res.json()) as { ok?: boolean; url?: string; reason?: string };
      if (json.ok && json.url) {
        window.location.href = json.url;
        return;
      }
      setError(json.reason ?? "Could not open billing. Try /workspace/billing.");
    } catch {
      setError("Network error. Try /workspace/billing.");
    } finally {
      setOpening(false);
    }
  }

  return (
    <div
      role="status"
      data-testid="trial-report-banner"
      className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900 flex flex-wrap items-center justify-between gap-2"
    >
      <span>
        <strong>{copy.segments[0]}</strong>
        <span className="mx-1.5 text-brand-300">·</span>
        <span data-testid="trial-report-used">{copy.segments[1]}</span>
        <span className="mx-1.5 text-brand-300">·</span>
        <span>{copy.segments[2]}</span>
        {error ? (
          <span role="alert" className="ml-2 text-red-700">
            {error}
          </span>
        ) : null}
      </span>
      <button
        type="button"
        onClick={handleManageBilling}
        disabled={opening}
        className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 ring-1 ring-brand-300 hover:bg-brand-100 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-wait"
      >
        {opening ? <Loader2 strokeWidth={1.75} className="h-3.5 w-3.5 animate-spin" /> : null}
        Manage billing
      </button>
    </div>
  );
}
