// Reseller customer-drawer data assembly.
//
// Per docs/plans/reseller-module-plan.md § U.7 — three tabs over
// operational-only fields:
//   1. Overview     — plan / billing / MRR / credits balance / last active
//   2. Progression  — timeline of milestones (timestamp + label, never content)
//                     + monthly SVI sparkline points
//   3. Reports      — list of report artifacts (metadata only; no download link,
//                     no preview — per R6 privacy line)
//
// The functions below are PURE — they consume already-fetched rows from the
// reseller-scoped supabase wrapper and return the drawer view-model. Keeping
// the shape/decision logic outside the DB layer means we exercise the
// timeline ordering + report metadata masking in vitest without needing a
// live database, mirroring the customer-reveal split (7/7 tests).

export type ProgressionEventKind =
  | "signup"
  | "onboarding_completed"
  | "first_svi_run"
  | "svi_score_update"
  | "report_generated"
  | "plan_change"
  | "credit_grant";

export interface ProgressionEvent {
  kind: ProgressionEventKind;
  ts: string; // ISO timestamp
  label: string; // human-readable label (no content, no URLs)
  detail?: string | null; // optional numeric delta / plan id / grant amount
}

export interface SviCurvePoint {
  month: string; // YYYY-MM
  score: number; // rounded average SVI for that month
}

export interface ReportArtifact {
  id: string;
  title: string; // svi_analyses.file_name || fallback
  type: string; // "svi_report" | "market_research" | ... — from input_type
  generated_at: string;
  size_bytes: number | null; // metadata only; null when unknown
}

export interface OverviewSummary {
  display_name: string | null;
  masked_email: string;
  signup_at: string;
  last_active_at: string | null;
  onboarding_completed: boolean;
  plan_label: string | null; // resolved from latest revenue_events plan_id, or null
  credits_balance: number; // 0 when no row
  mrr_aud_cents: number; // sum of net_aud_cents for recurring events in last 31 days
}

/* ------------------------------------------------------------------------- */
/* Row shapes (subset of what the callers pass in — matches what the        */
/* scoped supabase helpers actually SELECT).                                */
/* ------------------------------------------------------------------------- */

export interface AppUserBasics {
  id: string;
  email: string;
  display_name: string | null;
  created_at: string;
  last_login_at: string | null;
  onboarding_completed: boolean | null;
  onboarding_completed_at: string | null;
}

export interface SviAnalysisRow {
  id: string;
  total_svi: number | null;
  created_at: string;
  file_name: string | null;
  input_type: string | null;
}

export interface RevenueEventRow {
  ts: string;
  kind: string; // 'subscribe' | 'renewal' | 'upgrade' | 'downgrade' | ...
  plan_id: string | null;
  net_aud_cents: number | null;
}

export interface CreditTxRow {
  amount: number;
  reason: string;
  created_at: string;
}

/* ------------------------------------------------------------------------- */
/* Progression timeline                                                     */
/* ------------------------------------------------------------------------- */

/**
 * Build the progression timeline for one customer. Events are:
 * signup + onboarding_completed (from app_users), first_svi_run + subsequent
 * svi_score_update (from svi_analyses), report_generated (svi_analyses with
 * file_name), plan_change (revenue_events kind in {subscribe, renewal,
 * upgrade, downgrade}) and credit_grant (credit_transactions with reason in
 * {plan_grant, reseller_grant}). The output is sorted ascending by ts —
 * newest at the bottom of the timeline (client can reverse for display).
 */
export function buildProgressionTimeline(input: {
  user: AppUserBasics;
  svi: SviAnalysisRow[];
  revenue: RevenueEventRow[];
  credits: CreditTxRow[];
}): ProgressionEvent[] {
  const out: ProgressionEvent[] = [];

  out.push({
    kind: "signup",
    ts: input.user.created_at,
    label: "Signed up",
  });

  if (input.user.onboarding_completed && input.user.onboarding_completed_at) {
    out.push({
      kind: "onboarding_completed",
      ts: input.user.onboarding_completed_at,
      label: "Onboarding completed",
    });
  }

  const sviAsc = [...input.svi].sort((a, b) => a.created_at.localeCompare(b.created_at));
  let prevScore: number | null = null;
  sviAsc.forEach((row, idx) => {
    const score = typeof row.total_svi === "number" ? row.total_svi : null;
    if (idx === 0) {
      out.push({
        kind: "first_svi_run",
        ts: row.created_at,
        label: "First SVI analysis",
        detail: score !== null ? `score ${score}` : null,
      });
    } else if (score !== null) {
      const delta = prevScore !== null ? score - prevScore : null;
      out.push({
        kind: "svi_score_update",
        ts: row.created_at,
        label: "SVI re-scored",
        detail:
          delta !== null && delta !== 0
            ? `${delta > 0 ? "+" : ""}${delta} → ${score}`
            : `score ${score}`,
      });
    }
    if (row.file_name) {
      out.push({
        kind: "report_generated",
        ts: row.created_at,
        label: "Report generated",
        detail: null,
      });
    }
    if (score !== null) prevScore = score;
  });

  const PLAN_KINDS = new Set(["subscribe", "renewal", "upgrade", "downgrade"]);
  for (const ev of input.revenue) {
    if (!PLAN_KINDS.has(ev.kind)) continue;
    out.push({
      kind: "plan_change",
      ts: ev.ts,
      label: ev.kind === "subscribe" ? "Subscribed" : ev.kind === "renewal" ? "Renewed" : ev.kind === "upgrade" ? "Upgraded plan" : "Downgraded plan",
      detail: ev.plan_id ?? null,
    });
  }

  const GRANT_REASONS = new Set(["plan_grant", "reseller_grant"]);
  for (const tx of input.credits) {
    if (!GRANT_REASONS.has(tx.reason)) continue;
    if (tx.amount <= 0) continue;
    out.push({
      kind: "credit_grant",
      ts: tx.created_at,
      label: tx.reason === "reseller_grant" ? "Credits granted by reseller" : "Plan credits granted",
      detail: `+${tx.amount}`,
    });
  }

  out.sort((a, b) => a.ts.localeCompare(b.ts));
  return out;
}

/* ------------------------------------------------------------------------- */
/* SVI curve                                                                */
/* ------------------------------------------------------------------------- */

export function buildSviCurve(svi: SviAnalysisRow[]): SviCurvePoint[] {
  const monthBuckets = new Map<string, { sum: number; n: number }>();
  for (const row of svi) {
    if (typeof row.total_svi !== "number") continue;
    const month = row.created_at.slice(0, 7); // YYYY-MM
    const bucket = monthBuckets.get(month) ?? { sum: 0, n: 0 };
    bucket.sum += row.total_svi;
    bucket.n += 1;
    monthBuckets.set(month, bucket);
  }
  const out: SviCurvePoint[] = [];
  for (const [month, { sum, n }] of monthBuckets) {
    out.push({ month, score: Math.round(sum / n) });
  }
  out.sort((a, b) => a.month.localeCompare(b.month));
  return out;
}

/* ------------------------------------------------------------------------- */
/* Reports list                                                             */
/* ------------------------------------------------------------------------- */

const REPORT_TYPE_LABELS: Record<string, string> = {
  idea: "svi_report",
  url: "svi_report",
  file: "svi_report",
  research: "market_research",
  financial: "financial_projection",
  investor: "investor_deck",
};

export function buildReportsList(svi: SviAnalysisRow[]): ReportArtifact[] {
  return svi
    .filter((r) => r.file_name || r.total_svi !== null)
    .map((r) => ({
      id: r.id,
      title: r.file_name ?? `SVI analysis ${r.id.slice(0, 8)}`,
      type: REPORT_TYPE_LABELS[r.input_type ?? "idea"] ?? "svi_report",
      generated_at: r.created_at,
      size_bytes: null,
    }))
    .sort((a, b) => b.generated_at.localeCompare(a.generated_at));
}

/* ------------------------------------------------------------------------- */
/* Overview                                                                 */
/* ------------------------------------------------------------------------- */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function buildOverviewSummary(input: {
  user: AppUserBasics;
  masked_email: string;
  credits_balance: number;
  revenue: RevenueEventRow[];
  now: Date;
}): OverviewSummary {
  const nowMs = input.now.getTime();
  const windowStart = nowMs - 31 * MS_PER_DAY;

  let mrr = 0;
  let latestPlan: string | null = null;
  let latestPlanTs = 0;
  for (const ev of input.revenue) {
    const ts = new Date(ev.ts).getTime();
    if (Number.isFinite(ts) && ts >= windowStart && (ev.kind === "subscribe" || ev.kind === "renewal") && typeof ev.net_aud_cents === "number") {
      mrr += ev.net_aud_cents;
    }
    if (ev.plan_id && ts > latestPlanTs) {
      latestPlan = ev.plan_id;
      latestPlanTs = ts;
    }
  }

  return {
    display_name: input.user.display_name,
    masked_email: input.masked_email,
    signup_at: input.user.created_at,
    last_active_at: input.user.last_login_at,
    onboarding_completed: !!input.user.onboarding_completed,
    plan_label: latestPlan,
    credits_balance: input.credits_balance,
    mrr_aud_cents: mrr,
  };
}
