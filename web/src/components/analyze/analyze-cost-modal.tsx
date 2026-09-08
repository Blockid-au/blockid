"use client";

// AnalyzeCostModal — reusable "confirm the credits" dialog fired after
// the SmartIntake classifier has settled and the AgentLineup is known.
// Rows: agent · model tier · credits. Total + Run / Cancel buttons.
//
// Extracted from the inline confirm block in living-svi-dashboard.tsx so
// the same UX (Transparent Pricing rule) can be reused across /analyze,
// dashboard section unlock, and future report re-runs.

import * as React from "react";
import { cn } from "@/lib/utils";
import type { AgentRole } from "@/lib/report-pipeline/types";
import {
  MODEL_TIER_LABEL,
  type ModelTier,
  type PlannedAgent,
} from "@/lib/analyze/agent-plan";
import { Loader2, X } from "lucide-react";

const AGENT_LABEL: Record<AgentRole, string> = {
  ceo: "CEO",
  cto: "CTO",
  cfo: "CFO",
  cpo: "CPO",
  cmo: "CMO",
  cro: "CRO",
  clo: "CLO",
  chro: "CHRO",
  ciso: "CISO",
  cdo: "CDO",
  coo: "COO",
};

const TIER_TEXT: Record<ModelTier, string> = {
  opus: "text-svi-500",
  sonnet: "text-action",
  haiku: "text-secondary",
};

export interface CostRow {
  planned: PlannedAgent;
  credits: number;
  /** Optional per-agent note (e.g. "deep valuation" / "lite"). */
  note?: string;
}

export interface AnalyzeCostModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  rows: CostRow[];
  /** Show the founder how much cheaper the tuned lineup is vs a full teardown. */
  totalCredits?: number;
  fullTeardownCredits?: number;
  /** Founder's current balance — drives the "insufficient" state. */
  creditBalance?: number;
  title?: string;
  subtitle?: string;
  ctaLabel?: string;
  loading?: boolean;
  errorMessage?: string | null;
  /**
   * When the estimate endpoint returned 401 (unauthenticated) the confirm
   * CTA is swapped for a "Sign in to run — X credits" link. Pass the
   * absolute href (e.g. "/auth/login?next=/analyze") — no auto-navigation.
   */
  signInHref?: string;
  /** True while the caller is still fetching a live estimate. */
  estimateLoading?: boolean;
}

export function AnalyzeCostModal({
  open,
  onClose,
  onConfirm,
  rows,
  totalCredits,
  fullTeardownCredits,
  creditBalance,
  title = "Confirm the analysis",
  subtitle = "You'll only be charged after clicking Run. Nothing until then.",
  ctaLabel = "Run analysis",
  loading = false,
  errorMessage = null,
  signInHref,
  estimateLoading = false,
}: AnalyzeCostModalProps) {
  const total =
    totalCredits ?? rows.reduce((sum, r) => sum + (r.credits || 0), 0);
  const savings =
    typeof fullTeardownCredits === "number"
      ? Math.max(0, fullTeardownCredits - total)
      : 0;
  const canAfford =
    typeof creditBalance === "number" ? creditBalance >= total : true;

  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !loading) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, loading, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="analyze-cost-modal-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      data-testid="analyze-cost-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      <div className="relative w-full max-w-lg rounded-t-2xl border border-line-subtle bg-surface-raised p-5 shadow-xl sm:rounded-2xl">
        <button
          type="button"
          onClick={() => !loading && onClose()}
          disabled={loading}
          aria-label="Close dialog"
          className="absolute right-3 top-3 rounded-md p-1 text-tertiary transition-colors hover:bg-surface-hover"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>

        <div className="mb-4">
          <h2
            id="analyze-cost-modal-title"
            className="text-lg font-semibold text-primary"
          >
            {title}
          </h2>
          <p className="mt-1 text-xs text-muted">{subtitle}</p>
        </div>

        <ul className="mb-4 divide-y divide-line-subtle rounded-lg border border-line-subtle bg-surface">
          {rows.map((row) => (
            <li
              key={row.planned.agent}
              className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
              data-testid={`cost-row-${row.planned.agent}`}
            >
              <div className="flex items-center gap-2">
                <span className="font-semibold text-primary">
                  {AGENT_LABEL[row.planned.agent]}
                </span>
                <span
                  className={cn(
                    "text-[10px] font-semibold uppercase tracking-wider",
                    TIER_TEXT[row.planned.tier],
                  )}
                >
                  {MODEL_TIER_LABEL[row.planned.tier]}
                </span>
                {row.note && (
                  <span className="text-xs italic text-muted">
                    {row.note}
                  </span>
                )}
              </div>
              <span className="tabular-nums text-primary">
                {row.credits.toFixed(2)} cr
              </span>
            </li>
          ))}
        </ul>

        <div className="mb-4 rounded-lg bg-surface p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-medium text-primary">Total</span>
            <span
              className="text-lg font-semibold tabular-nums text-primary"
              data-testid="cost-total"
            >
              {total.toFixed(2)} cr
            </span>
          </div>
          {savings > 0 && (
            <p className="mt-1 text-xs text-bull">
              Saves {savings.toFixed(2)} cr vs a full 11-agent teardown.
            </p>
          )}
          {typeof creditBalance === "number" && (
            <p
              className={cn(
                "mt-1 text-xs",
                canAfford ? "text-muted" : "text-bear",
              )}
            >
              Your balance: {creditBalance.toFixed(2)} cr
              {!canAfford &&
                ` — need ${(total - creditBalance).toFixed(2)} more to run.`}
            </p>
          )}
        </div>

        {errorMessage && (
          <p className="mb-3 text-xs text-bear" role="alert">
            {errorMessage}
          </p>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg px-3 py-2 text-sm font-medium text-secondary transition-colors hover:bg-surface-hover"
          >
            Cancel
          </button>
          {signInHref ? (
            <a
              href={signInHref}
              className="inline-flex items-center gap-1.5 rounded-lg bg-action px-4 py-2 text-sm font-semibold text-on-action hover:bg-action-hover"
              data-testid="cost-signin"
            >
              Sign in to run — {total.toFixed(2)} cr
            </a>
          ) : (
            <button
              type="button"
              onClick={() => void onConfirm()}
              disabled={loading || estimateLoading || !canAfford}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition-colors",
                !canAfford || estimateLoading
                  ? "bg-surface-hover text-tertiary cursor-not-allowed"
                  : "bg-action text-on-action hover:bg-action-hover",
              )}
              data-testid="cost-confirm"
            >
              {(loading || estimateLoading) && (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              )}
              {loading
                ? "Running…"
                : estimateLoading
                  ? "Estimating…"
                  : ctaLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default AnalyzeCostModal;
