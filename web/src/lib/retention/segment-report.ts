// Segment retention report formatter — T-0418.
//
// Pure function that renders a weekly retention snapshot as markdown for a
// single audience segment. No IO; consumed by the /api/cron/weekly-retention
// route handler. Server-only so it never leaks into a client bundle.

import "server-only";

export interface SegmentMetrics {
  activeSubs: number;
  trialConversion: number;
  churn30d: number;
  netRevenueAud: number;
  asOf: string;
}

const SEGMENT_SUMMARIES: Record<string, (m: SegmentMetrics) => string> = {
  founder: (m) =>
    `Founder cohort: ${m.activeSubs} active subscribers, trial-to-paid running at ${formatPct(m.trialConversion)}. ` +
    `${m.churn30d} founders churned in the trailing 30 days against ${formatAud(m.netRevenueAud)} of net revenue — ` +
    `activation and coach touchpoints are the key retention levers to prioritise this week.`,
  investor_angel: (m) =>
    `Angel investors: ${m.activeSubs} paying seats and a ${formatPct(m.trialConversion)} trial conversion. ` +
    `${m.churn30d} churn events in the last 30 days against ${formatAud(m.netRevenueAud)} of net revenue; ` +
    `deal-flow quality and syndicate features drive stickiness here.`,
  investor_vc: (m) =>
    `VC seats: ${m.activeSubs} active, ${formatPct(m.trialConversion)} trial-to-paid, ${m.churn30d} churn in 30d against ` +
    `${formatAud(m.netRevenueAud)} net revenue. Focus on portfolio-monitoring depth and multi-seat expansion to lift LTV.`,
  advisor: (m) =>
    `Advisors: ${m.activeSubs} seats, ${formatPct(m.trialConversion)} trial-to-paid, ${m.churn30d} churn in 30d, ` +
    `${formatAud(m.netRevenueAud)} net revenue. Retention correlates with founder-match cadence — surface more matches per week.`,
  accelerator: (m) =>
    `Accelerator accounts: ${m.activeSubs} active programs, ${formatPct(m.trialConversion)} trial conversion, ` +
    `${m.churn30d} churned in 30d against ${formatAud(m.netRevenueAud)} net revenue. Cohort-level dashboards and ` +
    `demo-day exports are the retention drivers to double down on.`,
  lp: (m) =>
    `Limited Partners: ${m.activeSubs} active LP seats, ${formatPct(m.trialConversion)} trial-to-paid, ` +
    `${m.churn30d} churn in 30d, ${formatAud(m.netRevenueAud)} net revenue. Portfolio transparency and quarterly ` +
    `reporting cadence are the LP-facing retention levers this week.`,
  admin: (m) =>
    `Admin seats: ${m.activeSubs} internal accounts, ${formatPct(m.trialConversion)} trial-to-paid, ` +
    `${m.churn30d} churn events in 30d, ${formatAud(m.netRevenueAud)} net revenue. Admin churn is usually operational — ` +
    `verify SSO health and role-permission clarity.`,
};

function defaultSummary(segment: string, m: SegmentMetrics): string {
  return (
    `${segment}: ${m.activeSubs} active subscribers, ${formatPct(m.trialConversion)} trial-to-paid conversion. ` +
    `${m.churn30d} churn events in the trailing 30 days against ${formatAud(m.netRevenueAud)} of net revenue.`
  );
}

function formatPct(value: number): string {
  if (!Number.isFinite(value)) return "0.0%";
  return `${(value * 100).toFixed(1)}%`;
}

function formatAud(value: number): string {
  if (!Number.isFinite(value)) return "A$0";
  return `A$${Math.round(value).toLocaleString("en-AU")}`;
}

export function formatSegmentReport(
  segment: string,
  metrics: SegmentMetrics,
): string {
  const title = `# Retention snapshot — ${segment}`;
  const asOf = `_As of ${metrics.asOf}_`;

  const table = [
    "| Metric | Value |",
    "| --- | --- |",
    `| Active subscribers | ${metrics.activeSubs.toLocaleString("en-AU")} |`,
    `| Trial to paid (14d) | ${formatPct(metrics.trialConversion)} |`,
    `| Churn (30d) | ${metrics.churn30d.toLocaleString("en-AU")} |`,
    `| Net revenue (30d) | ${formatAud(metrics.netRevenueAud)} |`,
  ].join("\n");

  const summariser = SEGMENT_SUMMARIES[segment] ?? ((m: SegmentMetrics) => defaultSummary(segment, m));
  const summary = summariser(metrics);

  return `${title}\n\n${asOf}\n\n${table}\n\n## Summary\n\n${summary}\n`;
}
