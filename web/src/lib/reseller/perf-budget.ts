// Reseller console TTFB budget + evaluator.
//
// docs/plans/reseller-module-goal.md P10_hardening exit criterion:
//   "perf-audit: reseller console TTFB p95 < 500ms"
//
// The reseller console pages live at /reseller/{dashboard, customers, codes,
// credits, create-startup, reports, settings, requests}. This module pins the
// canonical route list + budget + pure evaluator so a live perf run (curl loop,
// k6 script, synthetic monitor) can be scored against a single vetted rulebook
// rather than each caller re-deriving the SLA math.
//
// Kept pure — no fetch, no fs, no clock — so unit tests can seed sample arrays
// and lock in edge cases (empty samples, single sample, p95 exactly on the
// boundary, all-fail, mixed pass/fail). A companion runner script can hand off
// its measured TTFB samples via evaluatePerfAudit() and format the result via
// formatPerfAuditReport() for the weekly digest.

/** TTFB p95 budget in milliseconds — must stay <= this to pass. */
export const TTFB_P95_BUDGET_MS = 500;

/** Canonical /reseller/* console routes exercised by the perf audit. */
export const RESELLER_CONSOLE_ROUTES: readonly string[] = [
  "/reseller",
  "/reseller/customers",
  "/reseller/codes",
  "/reseller/credits",
  "/reseller/create-startup",
  "/reseller/reports",
  "/reseller/requests",
  "/reseller/settings",
] as const;

export interface RouteSamples {
  route: string;
  /** TTFB samples in ms; caller may pass unsorted. */
  samples: readonly number[];
}

export interface RouteBudgetResult {
  route: string;
  sampleCount: number;
  p50: number | null;
  p95: number | null;
  p99: number | null;
  budgetMs: number;
  passed: boolean;
  /** Reason for the pass/fail decision — surface to digest / CLI. */
  reason: string;
}

export interface PerfAuditReport {
  budgetMs: number;
  routes: RouteBudgetResult[];
  overallPassed: boolean;
  overSlaCount: number;
  emptySampleCount: number;
}

/**
 * Nearest-rank percentile on a copy of the input; `samples` may be unsorted.
 * Returns null when the input is empty so callers can distinguish "no data"
 * from a real numeric result (a p95 of 0 is legal for a locally cached page).
 * Percentile is clamped to [0, 100].
 */
export function computePercentile(
  samples: readonly number[],
  pct: number,
): number | null {
  if (samples.length === 0) return null;
  const clamped = Math.min(100, Math.max(0, pct));
  const sorted = [...samples].sort((a, b) => a - b);
  if (clamped === 0) return sorted[0];
  const rank = Math.ceil((clamped / 100) * sorted.length);
  const idx = Math.min(sorted.length - 1, Math.max(0, rank - 1));
  return sorted[idx];
}

/**
 * Score one route's samples against the TTFB p95 budget. Empty samples fail
 * loudly rather than silently pass — a route with zero measurements is a
 * runner bug (blocked port, expired auth cookie) that would otherwise mask
 * a real regression.
 */
export function evaluateRouteBudget(
  input: RouteSamples,
  budgetMs: number = TTFB_P95_BUDGET_MS,
): RouteBudgetResult {
  const sampleCount = input.samples.length;
  const p50 = computePercentile(input.samples, 50);
  const p95 = computePercentile(input.samples, 95);
  const p99 = computePercentile(input.samples, 99);

  if (sampleCount === 0) {
    return {
      route: input.route,
      sampleCount,
      p50: null,
      p95: null,
      p99: null,
      budgetMs,
      passed: false,
      reason: "no_samples",
    };
  }

  const passed = p95 !== null && p95 <= budgetMs;
  const reason = passed
    ? `within_budget (p95=${p95}ms <= ${budgetMs}ms)`
    : `over_budget (p95=${p95}ms > ${budgetMs}ms)`;
  return {
    route: input.route,
    sampleCount,
    p50,
    p95,
    p99,
    budgetMs,
    passed,
    reason,
  };
}

/**
 * Score a full set of route samples in one pass. Overall report passes when
 * every listed route passes AND no route has zero samples. Callers that only
 * want a subset (e.g. the runner skipped /reseller/create-startup because the
 * reseller has can_create_startups=false) should filter before calling.
 */
export function evaluatePerfAudit(
  routeSamples: readonly RouteSamples[],
  budgetMs: number = TTFB_P95_BUDGET_MS,
): PerfAuditReport {
  const routes = routeSamples.map((rs) => evaluateRouteBudget(rs, budgetMs));
  const overSlaCount = routes.filter(
    (r) => r.sampleCount > 0 && !r.passed,
  ).length;
  const emptySampleCount = routes.filter((r) => r.sampleCount === 0).length;
  const overallPassed =
    routes.length > 0 &&
    overSlaCount === 0 &&
    emptySampleCount === 0;
  return {
    budgetMs,
    routes,
    overallPassed,
    overSlaCount,
    emptySampleCount,
  };
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatMs(v: number | null): string {
  return v === null ? "—" : `${v}ms`;
}

/**
 * Digest-ready HTML + text body pair. Kept in this module so the eventual
 * cron / CLI runner does not re-derive the row layout.
 */
export function formatPerfAuditReport(report: PerfAuditReport): {
  subject: string;
  html: string;
  text: string;
} {
  const status = report.overallPassed ? "PASS" : "FAIL";
  const failed = report.overSlaCount + report.emptySampleCount;
  const subject = `Reseller console perf audit — ${status}${
    failed > 0 ? ` (${failed} route${failed === 1 ? "" : "s"} off budget)` : ""
  }`;

  const rows = report.routes
    .map((r) => {
      const flag = r.passed ? "✓" : "✗";
      return `<tr><td>${flag}</td><td><code>${escapeHtml(r.route)}</code></td><td>${r.sampleCount}</td><td>${formatMs(r.p50)}</td><td>${formatMs(r.p95)}</td><td>${formatMs(r.p99)}</td><td>${escapeHtml(r.reason)}</td></tr>`;
    })
    .join("");
  const html = `<p><strong>${escapeHtml(subject)}</strong></p><p>Budget: TTFB p95 &lt;= ${report.budgetMs}ms.</p><table border="1" cellpadding="4" cellspacing="0"><thead><tr><th></th><th>Route</th><th>n</th><th>p50</th><th>p95</th><th>p99</th><th>Reason</th></tr></thead><tbody>${rows}</tbody></table>`;

  const textRows = report.routes
    .map(
      (r) =>
        `${r.passed ? "PASS" : "FAIL"}\t${r.route}\tn=${r.sampleCount}\tp50=${formatMs(r.p50)}\tp95=${formatMs(r.p95)}\tp99=${formatMs(r.p99)}\t${r.reason}`,
    )
    .join("\n");
  const text = `${subject}\nBudget: TTFB p95 <= ${report.budgetMs}ms\n\n${textRows}\n`;

  return { subject, html, text };
}
