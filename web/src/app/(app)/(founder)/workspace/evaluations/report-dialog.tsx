"use client";

// ReportDialog — confirm-before-charge dialog for the in-workspace Trust
// BizReport / re-score (T0271). Flow:
//   open → POST /api/evaluations/[id]/report {kind}            (preview, no charge)
//        → shows "1 of N included reports" or "3 credits (balance B)"
//        → Run → POST … {kind, confirm:true, idempotency_key}   (credits reserved first)
//        → links to /tbr/<token> + PDF.
// Transparent-pricing rule: the cost is on screen before the confirm button
// is enabled; a 402 preview disables it and points at credit packs.
//
// Timeouts (money-path review #9): a full run takes 1–3 min while Cloudflare
// caps the origin response at 100 s, so the confirmed POST carries one uuid
// minted per dialog open. If the fetch times out (RUN_TIMEOUT_MS) the dialog
// does NOT re-POST — it polls GET …/report?kind=&idempotency_key= every
// POLL_INTERVAL_MS for up to POLL_MAX_MS and picks up the row the server
// writes; a retried POST with the same key is answered from that row too.
// The server never charges twice for one key.

import * as React from "react";
import Link from "next/link";
import { ExternalLink, FileDown, Loader2, X } from "lucide-react";
import { EvaluatorReportDisclaimer } from "@/components/legal/evaluator-report-disclaimer";
import { useModalDialog } from "@/hooks/useModalDialog";

export type ReportKind = "full" | "rescore";

/** Mirrors ReportTrial in lib/evaluations/report-quota.ts (S7-C). */
export interface ReportTrialPreview {
  active: boolean;
  ends_at: string | null;
  allowance: number;
  used: number;
}

export interface ReportCostPreview {
  via: "quota" | "credits" | "none";
  credits: number;
  list_credits: number;
  balance: number;
  remaining_quota: number;
  quota: { limit: number; used: number; remaining: number; unlimited: boolean };
  /** Absent on older servers → treated as not trialing. */
  trial?: ReportTrialPreview | null;
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
  /** True when the server answered from an existing row (retry / poll). */
  reused?: boolean;
  trial?: ReportTrialPreview | null;
}

/** Client fetch budget for the confirmed POST (Cloudflare's origin cap is 100 s). */
export const RUN_TIMEOUT_MS = 150_000;
/** After a timeout, poll for the row this often … */
export const POLL_INTERVAL_MS = 10_000;
/** … for at most this long before giving up (the row may still land later). */
export const POLL_MAX_MS = 180_000;

export const TIMEOUT_COPY =
  "Still generating — this can take up to 3 minutes. We will not charge twice; reopen this dialog to pick it up.";

export function newIdempotencyKey(): string {
  const c = typeof globalThis.crypto !== "undefined" ? globalThis.crypto : null;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  // RFC 4122 v4 fallback for very old WebViews.
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const h = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export type RunOutcome =
  | { status: "ok"; result: ReportRunResult }
  | { status: "error"; message: string; cost?: ReportCostPreview }
  | { status: "timeout"; message: string };

export interface RunReportDeps {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  timeoutMs?: number;
  pollIntervalMs?: number;
  pollMaxMs?: number;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * The confirmed run, exported for tests: POST once with the key; on a
 * timeout / network drop poll GET for the row instead of re-POSTing.
 */
export async function runReport(
  args: { evaluationId: string; kind: ReportKind; idempotencyKey: string },
  deps: RunReportDeps = {},
): Promise<RunOutcome> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const sleep = deps.sleep ?? defaultSleep;
  const now = deps.now ?? Date.now;
  const timeoutMs = deps.timeoutMs ?? RUN_TIMEOUT_MS;
  const pollIntervalMs = deps.pollIntervalMs ?? POLL_INTERVAL_MS;
  const pollMaxMs = deps.pollMaxMs ?? POLL_MAX_MS;
  const path = `/api/evaluations/${encodeURIComponent(args.evaluationId)}/report`;
  const startedAt = new Date(now()).toISOString();

  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetchImpl(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: args.kind, confirm: true, idempotency_key: args.idempotencyKey }),
      signal: controller?.signal,
    });
    const json = (await res.json()) as (ReportRunResult & { ok: true }) | { ok: false; message?: string; error?: string; cost?: ReportCostPreview };
    if (json.ok) return { status: "ok", result: json };
    return { status: "error", message: json.message ?? json.error ?? "The report could not be generated. Nothing was charged.", cost: json.cost };
  } catch {
    // Abort (our timer) or a dropped connection: the server may still be
    // running — never re-POST; poll for the row instead.
  } finally {
    if (timer) clearTimeout(timer);
  }

  const pollStart = now();
  const query = `?kind=${encodeURIComponent(args.kind)}&idempotency_key=${encodeURIComponent(args.idempotencyKey)}&since=${encodeURIComponent(startedAt)}`;
  while (now() - pollStart < pollMaxMs) {
    await sleep(pollIntervalMs);
    try {
      const res = await fetchImpl(path + query, { method: "GET" });
      const json = (await res.json()) as { ok: boolean; report?: (ReportRunResult & { reused: true }) | null };
      if (json.ok && json.report) return { status: "ok", result: json.report };
    } catch {
      /* transient — keep polling */
    }
  }
  return { status: "timeout", message: TIMEOUT_COPY };
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

/**
 * Sentence the dialog shows for a preview — exported so the test can pin it.
 * While the subscription is trialing (S7-C) the wording is "Included in your
 * trial" for the 1 allowance, then "charged to credits" — never a block.
 */
export function describeCost(kind: ReportKind, cost: ReportCostPreview): string {
  const unit = cost.list_credits === 1 ? "credit" : "credits";
  const trial = cost.trial?.active ? cost.trial : null;
  if (cost.via === "quota" && trial) {
    return `Included in your trial — ${trial.allowance} full Trust BizReport${trial.allowance === 1 ? "" : "s"} free, ${cost.remaining_quota} left after this. No credits will be charged.`;
  }
  if (cost.via === "quota") {
    if (cost.quota.unlimited || bigNumber(cost.quota.limit)) {
      return "Included in your plan — unlimited reports this month. No credits will be charged.";
    }
    return `Uses 1 of your ${cost.quota.limit} included reports this month (${cost.remaining_quota} left after this). No credits will be charged.`;
  }
  if (cost.via === "credits") {
    const why =
      kind === "full"
        ? trial
          ? `Your trial's ${trial.allowance} included report${trial.allowance === 1 ? " is" : "s are"} used, so this run is charged to credits: `
          : cost.quota.limit > 0
            ? "Your included reports for this month are used up, so this run is charged to credits: "
            : "Charged to credits: "
        : "Re-scores are always pay-as-you-go: ";
    return `${why}${cost.list_credits} ${unit} (A$${cost.list_credits.toFixed(2)}). Balance ${cost.balance.toFixed(2)} → ${(cost.balance - cost.list_credits).toFixed(2)} after.`;
  }
  return `This needs ${cost.list_credits} ${unit} (A$${cost.list_credits.toFixed(2)}); your balance is ${cost.balance.toFixed(2)} and ${trial ? "your trial's included report is used" : "your plan has no included reports left this month"}.`;
}

/** Line under "Done — SVI n." after a run — exported so the test can pin it. */
export function describeResult(result: ReportRunResult): string {
  if (result.reused) return "This report was already generated for this run — nothing more was charged.";
  if (result.via === "quota") {
    if (result.trial?.active) {
      return `Used your included trial report${result.remaining_quota > 0 ? ` (${result.remaining_quota} left)` : " — further reports cost 3 credits (A$3) each"}.`;
    }
    return `Used 1 included report (${bigNumber(result.remaining_quota) ? "unlimited" : result.remaining_quota} left this month).`;
  }
  return `${result.credits_spent} credit${result.credits_spent === 1 ? "" : "s"} charged (balance ${result.balance.toFixed(2)}).`;
}

export function ReportDialog({ evaluationId, startupName, kind, onClose, onSuccess }: ReportDialogProps) {
  const [preview, setPreview] = React.useState<ReportCostPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [running, setRunning] = React.useState(false);
  const [result, setResult] = React.useState<ReportRunResult | null>(null);
  const [slow, setSlow] = React.useState(false);
  // One key per dialog open (the parent remounts per evaluation/kind via `key`).
  const idempotencyKey = React.useRef<string | null>(null);
  if (idempotencyKey.current === null) idempotencyKey.current = newIdempotencyKey();
  const copy = KIND_COPY[kind];
  // S8-B: focus trap, Escape → onClose, focus returns to the row button.
  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  useModalDialog(dialogRef, { onClose, initialFocus: "#report-dialog-title" });

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
    setSlow(false);
    const slowTimer = setTimeout(() => setSlow(true), 90_000);
    try {
      const outcome = await runReport({ evaluationId, kind, idempotencyKey: idempotencyKey.current as string });
      if (outcome.status === "ok") {
        setResult(outcome.result);
        onSuccess(outcome.result);
      } else if (outcome.status === "error") {
        if (outcome.cost) setPreview(outcome.cost);
        setError(outcome.message);
      } else {
        setError(outcome.message);
      }
    } finally {
      clearTimeout(slowTimer);
      setSlow(false);
      setRunning(false);
    }
  }

  const canRun = Boolean(preview) && preview?.via !== "none" && !running && !result;

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-dialog-title"
      aria-describedby="report-dialog-what"
      data-testid="report-dialog"
    >
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-surface-200 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-200">
          <h2 id="report-dialog-title" tabIndex={-1} className="text-lg font-bold text-ink-900 outline-none">
            {copy.title} — {startupName}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="h-8 w-8 flex items-center justify-center rounded-lg text-ink-500 hover:text-ink-700 hover:bg-surface-100 transition-colors cursor-pointer"
          >
            <X strokeWidth={1.75} className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 text-sm text-ink-700">
          <p id="report-dialog-what">{copy.what}</p>

          {/* Cost preview — shown BEFORE the confirm button is enabled */}
          <div data-testid="report-cost" role="status" aria-live="polite" className="rounded-xl border border-surface-200 bg-surface-50 px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Cost</div>
            {loadingPreview ? (
              <div className="mt-1 flex items-center gap-2 text-ink-600">
                <Loader2 strokeWidth={1.75} className="h-4 w-4 animate-spin" aria-hidden="true" /> Checking your plan and balance…
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
                Done — SVI <strong>{Math.round(result.svi)}</strong>. {describeResult(result)}
              </p>
              {result.report_url ? (
                <div className="flex flex-wrap gap-3">
                  <a
                    href={result.report_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
                  >
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Open report
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                  {result.pdf_url ? (
                    <a
                      href={result.pdf_url}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-brand-300 bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50"
                    >
                      <FileDown className="h-3.5 w-3.5" aria-hidden="true" /> Download PDF
                    </a>
                  ) : null}
                </div>
              ) : (
                <p className="text-xs">The share link could not be minted — the report is saved; open the startup to view it.</p>
              )}
            </div>
          ) : null}

          {running && slow && (
            <p role="status" className="text-xs text-ink-600">
              Still generating — a full report can take up to 3 minutes. Keep this dialog open; we will not charge twice.
            </p>
          )}

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
                aria-busy={running}
                data-testid="report-confirm"
                className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors cursor-pointer disabled:opacity-50"
              >
                {running && <Loader2 strokeWidth={1.75} className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                {running ? (kind === "full" ? "Generating (up to 3 min)…" : "Re-scoring…") : copy.button}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
