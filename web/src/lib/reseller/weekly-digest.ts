// Weekly leading-signal digest — CSV + HTML formatters for the P11 cron.
//
// Customer-Success advisory §24 rec #3 (docs/plans/reviews/plan-review-cs.md)
// asked for last-login recency + time-to-first-report as leading indicators
// so CS can act BEFORE attributed_churn_30d fires. The pure computation lives
// in leading-signals.ts; this file wraps a per-reseller LeadingSignalSummary
// with reseller metadata and emits the CSV/email shapes the cron delivers to
// admin@blockid.au.
//
// Kept dependency-free so the CSV column contract can be regression-tested
// without touching Supabase or nodemailer.

import type { AnomalySummary } from "./audit-anomaly";
import type { HumanBlockedItem } from "./human-blocked-registry";
import type { LeadingSignalSummary } from "./leading-signals";
import type { KAnonBucket } from "./portfolio-aggregates";

export interface WeeklyDigestRow {
  reseller_id: string;
  reseller_code: string;
  reseller_display_name: string;
  summary: LeadingSignalSummary;
}

/** ISO week key (YYYY-Www) for the calendar week `now` falls inside. */
export function isoWeekKey(now: Date): string {
  // Copy so we don't mutate the caller's Date.
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function bucketCell(b: KAnonBucket): string {
  return b.suppressed ? "<5" : String(b.count ?? 0);
}

function numericCell(n: number | null): string {
  return n === null ? "" : String(n);
}

function csvEscape(v: string | number): string {
  const s = String(v);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

const CSV_HEADERS = [
  "week",
  "reseller_id",
  "reseller_code",
  "reseller_display_name",
  "attributed_total",
  "inactive_7d",
  "inactive_30d",
  "never_generated_report",
  "activated_first_report",
  "activated_first_report_pct",
  "median_days_to_first_report",
] as const;

export function formatWeeklyDigestCsv(week: string, rows: WeeklyDigestRow[]): string {
  const lines: string[] = [CSV_HEADERS.join(",")];
  const sorted = [...rows].sort((a, b) =>
    a.reseller_code.localeCompare(b.reseller_code),
  );
  for (const r of sorted) {
    lines.push(
      [
        week,
        r.reseller_id,
        r.reseller_code,
        r.reseller_display_name,
        bucketCell(r.summary.attributed_total),
        bucketCell(r.summary.inactive_7d),
        bucketCell(r.summary.inactive_30d),
        bucketCell(r.summary.never_generated_report),
        bucketCell(r.summary.activated_first_report),
        numericCell(r.summary.activated_first_report_pct),
        numericCell(r.summary.median_days_to_first_report),
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

export function formatWeeklyDigestEmail(week: string, rows: WeeklyDigestRow[]): string {
  if (rows.length === 0) {
    return `<p>No active resellers with attributed customers for week ${week}.</p>`;
  }
  const sorted = [...rows].sort((a, b) =>
    a.reseller_code.localeCompare(b.reseller_code),
  );
  const body = sorted
    .map((r) => {
      const s = r.summary;
      return `
      <tr>
        <td>${escapeHtml(r.reseller_code)}</td>
        <td>${escapeHtml(r.reseller_display_name)}</td>
        <td style="text-align:right">${bucketCell(s.attributed_total)}</td>
        <td style="text-align:right">${bucketCell(s.inactive_7d)}</td>
        <td style="text-align:right">${bucketCell(s.inactive_30d)}</td>
        <td style="text-align:right">${bucketCell(s.never_generated_report)}</td>
        <td style="text-align:right">${bucketCell(s.activated_first_report)}</td>
        <td style="text-align:right">${
          s.activated_first_report_pct === null ? "—" : `${s.activated_first_report_pct}%`
        }</td>
        <td style="text-align:right">${
          s.median_days_to_first_report === null ? "—" : String(s.median_days_to_first_report)
        }</td>
      </tr>`;
    })
    .join("");

  return `
  <p>Reseller weekly leading-signal digest — ${week}.</p>
  <p>Counts under k=5 are suppressed as "&lt;5"; derived rates suppress when the denominator does.</p>
  <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
    <thead>
      <tr>
        <th>Code</th>
        <th>Display name</th>
        <th>Attributed</th>
        <th>Inactive 7d</th>
        <th>Inactive 30d</th>
        <th>Never report</th>
        <th>Activated</th>
        <th>Activation %</th>
        <th>Median days to first report</th>
      </tr>
    </thead>
    <tbody>${body}
    </tbody>
  </table>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Renders the audit-log anomaly section for the weekly digest.
 *
 * Returns an empty string when both hotspot lists are empty so the caller can
 * unconditionally append the result: zero hits → zero live-ops noise. When
 * hits exist, the caller composes it after {@link formatWeeklyDigestEmail} so
 * the CS-owned leading-signal table stays the primary content and the anomaly
 * block reads as a supplementary alert.
 *
 * The optional `resellerDisplayNames` map lets callers surface the human
 * reseller code beside each `reseller_id` UUID; unknown ids render as the
 * bare UUID (short suffix) so ops can still pivot on them.
 */
export function formatWeeklyDigestAnomaliesSection(
  summary: AnomalySummary,
  resellerDisplayNames: Record<string, string> = {},
): string {
  const { actor_hotspots, subject_hotspots } = summary;
  if (actor_hotspots.length === 0 && subject_hotspots.length === 0) return "";

  const resellerLabel = (id: string): string => {
    const name = resellerDisplayNames[id];
    if (name) return escapeHtml(name);
    return escapeHtml(id.length > 8 ? `${id.slice(0, 8)}…` : id);
  };
  const uuidShort = (id: string): string =>
    escapeHtml(id.length > 8 ? `${id.slice(0, 8)}…` : id);

  const actorRows = actor_hotspots
    .map(
      (h) => `
      <tr>
        <td>${resellerLabel(h.reseller_id)}</td>
        <td>${uuidShort(h.actor_user_id)}</td>
        <td style="text-align:right">${h.count}</td>
        <td style="text-align:right">${h.distinct_subjects}</td>
        <td>${escapeHtml(h.actions.join(", "))}</td>
      </tr>`,
    )
    .join("");
  const subjectRows = subject_hotspots
    .map(
      (h) => `
      <tr>
        <td>${resellerLabel(h.reseller_id)}</td>
        <td>${uuidShort(h.subject_user_id)}</td>
        <td style="text-align:right">${h.count}</td>
        <td style="text-align:right">${h.distinct_actors}</td>
        <td>${escapeHtml(h.actions.join(", "))}</td>
      </tr>`,
    )
    .join("");

  const windowLabel = `${escapeHtml(summary.window_start)} → ${escapeHtml(summary.window_end)}`;
  const parts: string[] = [
    `<h3 style="margin-top:24px;font-family:Arial,sans-serif;font-size:14px">Audit-log anomalies (${windowLabel}, threshold ${summary.threshold})</h3>`,
    `<p style="font-family:Arial,sans-serif;font-size:13px">${summary.total_rows_in_window} privileged-read row${summary.total_rows_in_window === 1 ? "" : "s"} in window.</p>`,
  ];
  if (actorRows) {
    parts.push(`
    <p style="font-family:Arial,sans-serif;font-size:13px;margin-bottom:4px"><strong>Actor hotspots</strong> — one reseller admin reading many subjects.</p>
    <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
      <thead>
        <tr>
          <th>Reseller</th>
          <th>Actor</th>
          <th>Count</th>
          <th>Distinct subjects</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>${actorRows}
      </tbody>
    </table>`);
  }
  if (subjectRows) {
    parts.push(`
    <p style="font-family:Arial,sans-serif;font-size:13px;margin-top:16px;margin-bottom:4px"><strong>Subject hotspots</strong> — one customer being probed repeatedly.</p>
    <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
      <thead>
        <tr>
          <th>Reseller</th>
          <th>Subject</th>
          <th>Count</th>
          <th>Distinct actors</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>${subjectRows}
      </tbody>
    </table>`);
  }
  return parts.join("");
}

/**
 * Renders the human-review escalation section for the weekly digest.
 *
 * Closes COO advisory rec #1 (docs/plans/reviews/plan-review-coo.md): the two
 * open human_blocked leaves (P1.5 InfoVision seed on H.20 ABN + GST; P8.5
 * Stripe add-on env vars) need to surface in the Monday digest so the operator
 * sees them without grepping the goal file.
 *
 * Returns an empty string when `items` is empty so callers can unconditionally
 * append. The block is a compact table — one row per open escalation with the
 * phase, title, blocker sentence, owner, and required action.
 */
export function formatWeeklyDigestHumanBlockedSection(
  items: ReadonlyArray<HumanBlockedItem>,
): string {
  if (items.length === 0) return "";

  const sorted = [...items].sort((a, b) => a.phase.localeCompare(b.phase));
  const rows = sorted
    .map(
      (i) => `
      <tr>
        <td>${escapeHtml(i.phase)}</td>
        <td>${escapeHtml(i.title)}</td>
        <td>${escapeHtml(i.blocker)}</td>
        <td>${escapeHtml(i.owner)}</td>
        <td>${escapeHtml(i.action_required)}</td>
      </tr>`,
    )
    .join("");

  return `
    <h3 style="margin-top:24px;font-family:Arial,sans-serif;font-size:14px">Human-review escalations (${sorted.length} open)</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">The autonomous loop cannot advance these until a human unblocks each item. Source of truth: <code>docs/plans/reseller-module-goal.md</code>.</p>
    <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
      <thead>
        <tr>
          <th>Phase</th>
          <th>Item</th>
          <th>Blocker</th>
          <th>Owner</th>
          <th>Action required</th>
        </tr>
      </thead>
      <tbody>${rows}
      </tbody>
    </table>`;
}
