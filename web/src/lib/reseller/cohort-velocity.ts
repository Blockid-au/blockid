// Weekly digest — per-reseller cohort velocity across the last 3 UTC month
// cohorts (P11.10).
//
// P11 canonical KPI list (reseller-module-goal.md `weekly_digest_kpis`) names
// `cohort_velocity` as one of the ongoing signals the Monday digest should
// surface, per plan-delta-2026-07-23.md D2-CFO-07 (CFO §5 expanded KPI set
// — cohort_velocity_median_days). Before this module the digest surfaced
// leading-signals + audit anomalies + human_blocked + budget-utilization
// (P11.1) + tier-mix (P11.2) + commission_cleared_mtd (P11.3) +
// clawback_exposure (P11.4) + attributed_mrr (P11.5) +
// attributed_net_contribution (P11.6) + attributed_churn_30d (P11.7) +
// ledger_drift_events (P11.8) + gst_reconciliation_delta (P11.9) — but the
// funnel-speed answer ("how fast are new attributed customers reaching their
// first svi_analysis?") required an ops user to hand-window reseller_attributions
// by month and diff each customer's earliest svi_analyses.created_at against
// their attributed_at.
//
// Activation signal choice: first svi_analysis (report generation) rather than
// first paid subscription because the reseller channel is validated by whether
// referred founders start using the product, not just whether they pay — plans
// gate downloads, not authoring, so a founder who never converts to paid can
// still produce a report. This mirrors the leading-signals module's
// median_days_to_first_report primary KPI so cohort velocity is a cohort-scoped
// generalisation, not a competing definition.
//
// Cohort definition: bucket each attribution by attributed_at's UTC month
// (YYYY-MM). The digest requests the last 3 UTC months (current + previous
// + previous-1) so ops sees a rolling trend. Empty cohorts still render so a
// month with zero net-new attribution is visible not absent (mirrors the zero-
// row survival posture of tier-mix + churn).
//
// Kept dependency-free so the CSV/HTML shape can be regression-tested without
// touching Supabase or nodemailer — mirrors attributed-churn-30d.ts (P11.7).

export const COHORT_MONTHS_WINDOW = 3;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Return the UTC month key (YYYY-MM) for a Date. Matches monthKey() from
 * credit-grants.ts so cross-KPI joins keyed on month land in the same bucket.
 */
export function cohortMonthKey(d: Date): string {
  const y = d.getUTCFullYear().toString().padStart(4, "0");
  const m = (d.getUTCMonth() + 1).toString().padStart(2, "0");
  return `${y}-${m}`;
}

/**
 * Return the sorted-descending list of the last N UTC month keys ending at
 * `now`. The current month is first so the digest's newest cohort renders at
 * the top of the section — leading indicator gets visual priority.
 */
export function recentCohortKeys(now: Date, count = COHORT_MONTHS_WINDOW): string[] {
  const keys: string[] = [];
  const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  for (let i = 0; i < count; i += 1) {
    keys.push(cohortMonthKey(cursor));
    cursor.setUTCMonth(cursor.getUTCMonth() - 1);
  }
  return keys;
}

/**
 * One attribution row the digest cron passes into computeCohortVelocity.
 * The cron resolves the fields by reading reseller_attributions scoped to the
 * active + not-opted-out set for each active reseller.
 */
export interface AttributionCohortRow {
  reseller_id: string;
  subject_user_id: string;
  attributed_at: string;
}

/**
 * One svi_analyses row (email-keyed in the underlying table but the cron
 * bridges to user_id via app_users.email) with the generated_at timestamp.
 */
export interface ActivationEventRow {
  user_id: string;
  generated_at: string;
}

export interface CohortVelocity {
  cohort_month: string;
  attributed_count: number;
  activated_count: number;
  activation_pct: number;
  median_days_to_activation: number | null;
}

function parseTs(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/**
 * Nearest-rank median on a non-empty numeric array. Mirrors computePercentile
 * from perf-budget.ts but hard-coded to the 50th percentile so callers do not
 * need to know the ranking convention.
 */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length / 2) - 1));
  return sorted[idx];
}

/**
 * Fold attribution + activation rows for a single reseller + single cohort
 * month into a velocity aggregate.
 *
 * `firstActivationByUser` is a per-user user_id → earliest activation timestamp
 * map so the caller resolves the "first svi_analysis per user" collapse once
 * and reuses it across every cohort/reseller.
 */
export function computeCohortVelocity(
  cohortMonth: string,
  attributions: ReadonlyArray<AttributionCohortRow>,
  firstActivationByUser: ReadonlyMap<string, number>,
): CohortVelocity {
  const seen = new Set<string>();
  const daysDeltas: number[] = [];
  let attributed = 0;
  let activated = 0;
  for (const a of attributions) {
    const attrTs = parseTs(a.attributed_at);
    if (attrTs === null) continue;
    // Collapse per user_id so multiple attributions for one customer in the
    // same cohort do not double-count — mirrors the customersByReseller Set
    // semantics used in the cron.
    if (seen.has(a.subject_user_id)) continue;
    seen.add(a.subject_user_id);
    attributed += 1;
    const activationTs = firstActivationByUser.get(a.subject_user_id);
    if (activationTs === undefined) continue;
    // Activation before attribution (e.g. a founder who authored a report
    // before being attributed) counts as immediate — 0-day velocity is the
    // truthful answer for "how long from attribution to first report" when
    // the report predated the attribution row.
    const deltaMs = Math.max(0, activationTs - attrTs);
    daysDeltas.push(Math.floor(deltaMs / MS_PER_DAY));
    activated += 1;
  }
  const activationPct = attributed > 0 ? Math.floor((activated * 100) / attributed) : 0;
  const medianDays = daysDeltas.length > 0 ? median(daysDeltas) : null;
  return {
    cohort_month: cohortMonth,
    attributed_count: attributed,
    activated_count: activated,
    activation_pct: activationPct,
    median_days_to_activation: medianDays,
  };
}

export interface ResellerCohortVelocity {
  reseller_id: string;
  cohorts: CohortVelocity[];
}

/**
 * Fold attribution rows across every requested reseller × cohort month combo.
 * `cohortMonths` should come from recentCohortKeys(now) so the digest's cohort
 * window matches the render order (newest first).
 *
 * Every reseller in `resellerIds` receives one CohortVelocity row per cohort
 * month even if attributed_count is 0 for that cell, so ops can eyeball a
 * partner whose cohort dried up rather than wondering whether a missing row is
 * a query bug or a genuine zero.
 */
export function computeCohortVelocityByReseller(
  resellerIds: ReadonlyArray<string>,
  cohortMonths: ReadonlyArray<string>,
  attributions: ReadonlyArray<AttributionCohortRow>,
  activations: ReadonlyArray<ActivationEventRow>,
): Map<string, ResellerCohortVelocity> {
  const firstActivation = new Map<string, number>();
  for (const e of activations) {
    const ts = parseTs(e.generated_at);
    if (ts === null) continue;
    const prev = firstActivation.get(e.user_id);
    if (prev === undefined || ts < prev) firstActivation.set(e.user_id, ts);
  }
  const grouped = new Map<string, Map<string, AttributionCohortRow[]>>();
  for (const a of attributions) {
    const ts = parseTs(a.attributed_at);
    if (ts === null) continue;
    const key = cohortMonthKey(new Date(ts));
    const perReseller = grouped.get(a.reseller_id) ?? new Map<string, AttributionCohortRow[]>();
    const list = perReseller.get(key) ?? [];
    list.push(a);
    perReseller.set(key, list);
    grouped.set(a.reseller_id, perReseller);
  }
  const out = new Map<string, ResellerCohortVelocity>();
  for (const id of resellerIds) {
    const perReseller = grouped.get(id) ?? new Map<string, AttributionCohortRow[]>();
    const cohorts = cohortMonths.map((cohortMonth) =>
      computeCohortVelocity(
        cohortMonth,
        perReseller.get(cohortMonth) ?? [],
        firstActivation,
      ),
    );
    out.set(id, { reseller_id: id, cohorts });
  }
  return out;
}

export interface CohortVelocityRow {
  reseller_id: string;
  reseller_code: string;
  reseller_display_name: string;
  cohorts: CohortVelocity[];
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderDaysCell(days: number | null): string {
  return days === null ? "&mdash;" : `${days}`;
}

function renderPctCell(pct: number, attributed: number): string {
  return attributed > 0 ? `${pct}%` : "&mdash;";
}

/**
 * Render the cohort-velocity section for the weekly digest. Returns an empty
 * string when `rows` is empty so the caller can unconditionally append the
 * result.
 *
 * Layout: one row per reseller × cohort so ops can eyeball week-over-week
 * trending inside a partner's book without cross-referencing three cells in
 * a wide table. Cohorts render newest-first (matches recentCohortKeys). Median
 * day column renders as "—" when activated_count is 0 (no observations to
 * median). Activation % column renders as "—" when the cohort had no
 * attribution so a zero-attrib cohort is not misleadingly 0%.
 */
export function formatWeeklyDigestCohortVelocitySection(
  rows: ReadonlyArray<CohortVelocityRow>,
): string {
  if (rows.length === 0) return "";
  const sorted = [...rows].sort((a, b) =>
    a.reseller_code.localeCompare(b.reseller_code),
  );
  const body = sorted
    .flatMap((r) =>
      r.cohorts.map((c, idx) => {
        const codeCell = idx === 0 ? escapeHtml(r.reseller_code) : "";
        const nameCell = idx === 0 ? escapeHtml(r.reseller_display_name) : "";
        return `
      <tr>
        <td>${codeCell}</td>
        <td>${nameCell}</td>
        <td>${escapeHtml(c.cohort_month)}</td>
        <td style="text-align:right">${c.attributed_count}</td>
        <td style="text-align:right">${c.activated_count}</td>
        <td style="text-align:right">${renderPctCell(c.activation_pct, c.attributed_count)}</td>
        <td style="text-align:right">${renderDaysCell(c.median_days_to_activation)}</td>
      </tr>`;
      }),
    )
    .join("");
  return `
    <h3 style="margin-top:24px;font-family:Arial,sans-serif;font-size:14px">Cohort velocity (last ${COHORT_MONTHS_WINDOW} UTC months)</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Per-reseller × per-cohort funnel speed. Cohort = UTC-month of <code>reseller_attributions.attributed_at</code>. Activation = customer's first <code>svi_analyses.created_at</code> (report generation), collapsed per user so multiple attributions for one customer are not double-counted. Median day column is <code>floor(days_since_attribution)</code> across activated customers only; renders as &mdash; when no customer in the cohort activated yet. Activation % renders as &mdash; when the cohort had no attribution.</p>
    <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
      <thead>
        <tr>
          <th>Code</th>
          <th>Display name</th>
          <th>Cohort</th>
          <th>Attributed</th>
          <th>Activated</th>
          <th>Activation %</th>
          <th>Median days</th>
        </tr>
      </thead>
      <tbody>${body}
      </tbody>
    </table>`;
}
