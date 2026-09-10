"use client";

// ReportDialog — confirm-before-charge dialog for the in-workspace Trust
// BizReport / re-score (T0271). Flow:
//   open → POST /api/evaluations/[id]/report {kind}            (preview, no charge)
//        → shows "1 of N included reports" or "3 credits (balance B)"
//        → Run → POST … {kind, confirm:true}                    (charged after success)
//        → links to /tbr/<token> + PDF.
// Transparent-pricing rule: the cost is on screen before the confirm button
// is enabled; a 402 preview disables it and points at credit packs.

import * as React from "react";
import Link from "next/link";
import { ExternalLink, FileDown, Loader2, X } from "lucide-react";
import { EvaluatorReportDisclaimer } from "@/components/legal/evaluator-report-disclaimer";

export type ReportKind = "full" | "rescore";

export interface ReportCostPreview {
  via: "quota" | "credits" | "none";
  credits: number;
  list_credits: number;
  balance: number;
  remaining_quota: number;
  quota: { limit: number; used: number; remaining: number; unlimited: boolean };
}

export interface ReportRunResult {
  kind: ReportKind;
  via: "quota" | "credits";
  credits_spent: number;
  balance: number;
  remaining_quota: number;
  svi: number;
  report_url: string | null;
  pdf_url: string | null;
  share_token: string | null;
}

export interface ReportDialogProps {
  evaluationId: string;
  startupName: string;
  kind: ReportKind;
  onClose: () => void;
  /** Called once the run succeeded so the row can show "Last report". */
  onSuccess: (result: ReportRunResult) => void;
}

export const KIND_COPY: Record<ReportKind, { title: string; what: string; button: string }> = {
  full: {
    title: "Run Trust BizReport",
    what: "8 dimensions, 13 criteria, AUD valuation range, ≈2,500 words — the same report a founder buys for A$3.",
    button: "Run report",
  },
  rescore: {
    title: "Re-score",
    what: "Re-runs the SVI score over the stored profile plus every evidence item added since the last report. No new narrative.",
    button: "Re-score",
  },
};

function bigNumber(n: number): boolean {
  return n >= Number.MAX_SAFE_INTEGER || n >= 1_000_000;
}

/** Sentence the dialog shows for a preview — exported so the test can pin it. */
export function describeCost(kind: ReportKind, cost: ReportCostPreview): string {
  const unit = cost.list_credits === 1 ? "credit" : "credits";
  if (cost.via === "quota") {
    if (cost.quota.unlimited || bigNumber(cost.quota.limit)) {
      return "Included in your plan — unlimited reports this month. No credits will be charged.";
    }
    return `Uses 1 of your ${cost.quota.limit} included reports this month (${cost.remaining_quota} left after this). No credits will be charged.`;
  }
  if (cost.via === "credits") {
    const why =
      kind === "full"
        ? cost.quota.limit > 0
          ? "Your included reports for this month are used up, so this run is charged to credits: "
          : "Charged to credits: "
        : "Re-scores are always pay-as-you-go: ";
    return `${why}${cost.list_credits} ${unit} (A$${cost.list_credits.toFixed(2)}). Balance ${cost.balance.toFixed(2)} → ${(cost.balance - cost.list_credits).toFixed(2)} after.`;
  }
  return `This needs ${cost.list_credits} ${unit} (A$${cost.list_credits.toFixed(2)}); your balance is ${cost.balance.toFixed(2)} and your plan has no included reports left this month.`;
}

export function ReportDialog({ evaluationId, startupName, kind, onClose, onSuccess }: ReportDialogProps) {
  const [preview, setPreview] = React.useState<ReportCostPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [running, setRunning] = React.useState(false);
  const [result, setResult] = React.useState<ReportRunResult | null>(null);
  const copy = KIND_COPY[kind];

  // The parent mounts one dialog per (evaluationId, kind) via `key`, so the
  // initial state already reads "loading, no error" — no reset needed here.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/evaluations/${encodeURIComponent(evaluationId)}/report`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind }),
        });
        const json = (await res.json()) as { ok: boolean; cost?: ReportCostPreview; message?: string; error?: string };
        if (cancelled) return;
        if (json.cost) setPreview(json.cost);
        else setError(json.message ?? json.error ?? "Could not load the price for this run.");
      } catch {
        if (!cancelled) setError("Network error. Please try again.");
      } finally {
        if (!cancelled) setLoadingPreview(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [evaluationId, kind]);

  async function handleRun() {
    if (!preview || preview.via === "none") return;
    setRunning(true);
    setError(null);
    try {
      const res = await fetch(`/api/evaluations/${encodeURIComponent(evaluationId)}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, confirm: true }),
      });
      const json = (await res.json()) as (ReportRunResult & { ok: true }) | { ok: false; message?: string; error?: string; cost?: ReportCostPreview };
      if (json.ok) {
        setResult(json);
        onSuccess(json);
      } else {
        if (json.cost) setPreview(json.cost);
        setError(json.message ?? json.error ?? "The report could not be generated. Nothing was charged.");
      }
    } catch {
      setError("Network error. Nothing was charged — please try again.");
    } finally {
      setRunning(false);
    }
  }

  const canRun = Boolean(preview) && preview?.via !== "none" && !running && !result;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-dialog-title"
      data-testid="report-dialog"
    >
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-surface-200 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-200">
          <h2 id="report-dialog-title" className="text-lg font-bold text-ink-900">
            {copy.title} — {startupName}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="h-8 w-8 flex items-center justify-center rounded-lg text-ink-500 hover:text-ink-700 hover:bg-surface-100 transition-colors cursor-pointer"
          >
            <X strokeWidth={1.75} className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 text-sm text-ink-700">
          <p>{copy.what}</p>

          {/* Cost preview — shown BEFORE the confirm button is enabled */}
          <div data-testid="report-cost" className="rounded-xl border border-surface-200 bg-surface-50 px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Cost</div>
            {loadingPreview ? (
              <div className="mt-1 flex items-center gap-2 text-ink-600">
                <Loader2 strokeWidth={1.75} className="h-4 w-4 animate-spin" /> Checking your plan and balance…
              </div>
            ) : preview ? (
              <p className={`mt-1 ${preview.via === "none" ? "text-amber-800" : "text-ink-800"}`}>{describeCost(kind, preview)}</p>
            ) : null}
            {preview?.via === "none" && (
              <Link href="/workspace/billing#credits" className="mt-2 inline-block font-semibold text-brand-700 underline">
                Buy credits
              </Link>
            )}
          </div>

          {result ? (
            <div role="status" data-testid="report-result" className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-emerald-900 space-y-2">
              <p>
                Done — SVI <strong>{Math.round(result.svi)}</strong>.{" "}
                {result.via === "quota"
                  ? `Used 1 included report (${bigNumber(result.remaining_quota) ? "unlimited" : result.remaining_quota} left this month).`
                  : `${result.credits_spent} credit${result.credits_spent === 1 ? "" : "s"} charged (balance ${result.balance.toFixed(2)}).`}
              </p>
              {result.report_url ? (
                <div className="flex flex-wrap gap-3">
                  <a
                    href={result.report_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Open report
                  </a>
                  {result.pdf_url ? (
                    <a
                      href={result.pdf_url}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-brand-300 bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50"
                    >
                      <FileDown className="h-3.5 w-3.5" /> Download PDF
                    </a>
                  ) : null}
                </div>
              ) : (
                <p className="text-xs">The share link could not be minted — the report is saved; open the startup to view it.</p>
              )}
            </div>
          ) : null}

          {error && (
            <p role="alert" className="text-sm font-medium text-red-600">
              {error}
            </p>
          )}

          <EvaluatorReportDisclaimer variant="compact" />

          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-ink-600 hover:bg-surface-100 transition-colors cursor-pointer"
            >
              {result ? "Close" : "Cancel"}
            </button>
            {!result && (
              <button
                type="button"
                onClick={handleRun}
                disabled={!canRun}
                data-testid="report-confirm"
                className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors cursor-pointer disabled:opacity-50"
              >
                {running && <Loader2 strokeWidth={1.75} className="h-3.5 w-3.5 animate-spin" />}
                {running ? (kind === "full" ? "Generating (1–3 min)…" : "Re-scoring…") : copy.button}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
