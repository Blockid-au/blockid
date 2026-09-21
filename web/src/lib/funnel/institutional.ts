// G21 P0-D — the institutional (FI) funnel for /admin/funnel.
//
//   Acquisition → Activation → Engagement → Revenue → Trust → Data moat,
//   plus the North Star: startups assessed through paying institutional
//   workflows per month (= evaluation_batch_items scored inside batches
//   owned by an account on a paying Program / Fund / Cohort / Intake plan or
//   an active paid pilot).
//
// Honesty rules (goal doc § P0-D): a metric is `live` only when a data path
// exists today; `p1` / `p3` metrics render as "—" with the phase that adds
// the path — never a fake zero. QA rows are excluded like the founder funnel.
//
// Pure reducers (`reduceInstitutional`, `computeNorthStar`) are unit-tested;
// `readInstitutionalFunnel` is the fail-soft server reader (analytics_events
// through the same 28-day window as the founder funnel, evaluation_batch_*
// + app_users for the North Star, the traction snapshot JSON for MRR and
// counts).

import { STALE_AFTER_DAYS, countStaleConnectors } from "@/lib/evidence/freshness";
import { computeLongitudinal, LONGITUDINAL_MIN_GAP_DAYS, type SnapshotDateRow } from "@/lib/outcomes/data-moat";
import { getStatusRoot, readJsonFile, REPORTS_DIR } from "@/lib/status/jsonl";
import { readTbrGrounding } from "@/lib/status/tbr-grounding";
import { dayString, isQaRow, rowsInWindow, type FunnelEventRow } from "./core";

export type FiMetricStatus = "live" | "p1" | "p2" | "p3";

export interface FiMetric {
  key: string;
  label: string;
  value: number | null;
  /** How to print `value`: a count, AUD cents, or a ratio 0..1. */
  unit: "count" | "aud_cents" | "ratio";
  status: FiMetricStatus;
  note: string;
}

export type FiSectionKey = "acquisition" | "activation" | "engagement" | "revenue" | "trust" | "data_moat";

export interface FiSection {
  key: FiSectionKey;
  label: string;
  metrics: FiMetric[];
}

/** analytics_events names the institutional reducer reads. */
export const FI_FUNNEL_EVENT_NAMES: readonly string[] = Object.freeze([
  "svi_analyze",
  "svi_score_computed",
  "website_imported",
  "evidence_upload",
  "evidence_verified",
  "score_recalculated",
  "report_view",
  "tbr_share_created",
  "cohort_action",
  "cohort_created",
  "startup_added_to_cohort",
  "batch_scored",
  "dossier_view",
  "assessment_submitted",
  "pilot_started",
  "checkout_completed",
  "subscription_created",
  "subscription_renewed",
]);

/** Plans whose batches count as "paying institutional workflows". */
export const PAYING_INSTITUTIONAL_PLANS: readonly string[] = Object.freeze([
  "investor_vc_small", // Program
  "investor_vc_ent",
  "investor_fund", // Fund
  "accelerator_intake", // Intake link
  "accelerator_starter", // Cohort 25
  "accelerator_growth", // Cohort 100
  "accelerator_enterprise",
  "index_api",
]);

/** Counts the reader supplies from tables / the traction snapshot (null = unavailable). */
export interface InstitutionalDbCounts {
  program_leads: number | null;
  demo_leads: number | null;
  companies: number | null;
  snapshots: number | null;
  evidence_records: number | null;
  /** G21 P3-A: evidence_records rows (0417, the Claim ≠ Evidence graph). */
  claim_evidence_records: number | null;
  /** G21 P3-A: projects with ≥ 2 snapshots ≥ 30 days apart. */
  longitudinal_companies: number | null;
  /** G21 P3-A: startup_outcomes rows with status confirmed. */
  known_outcomes: number | null;
  /** G21 P3-A: startup_outcomes rows with status proposed. */
  proposals_pending: number | null;
  verified_claims: number | null;
  evidence_level_distribution: Record<string, number> | null;
  /** G21 P3-C: (project, provider) connections past the connector proof TTL (lib/evidence/freshness.ts). */
  stale_connectors: number | null;
  /** G25: validation-tracker entries with a generated Cohort proposal (proposal_generated_at); null when the ledger is unreadable. */
  cohort_proposals: number | null;
  /** G23-C: the latest pipeline run's groundedShare (tbr-quality.jsonl); null when no run is logged. */
  report_grounding: number | null;
  /** G23-C: the grounding KPI the share is measured against (0.85). */
  report_grounding_kpi: number | null;
  mrr_cents: number | null;
  paying_orgs: number | null;
}

export function emptyDbCounts(): InstitutionalDbCounts {
  return {
    program_leads: null,
    demo_leads: null,
    cohort_proposals: null,
    companies: null,
    snapshots: null,
    evidence_records: null,
    claim_evidence_records: null,
    longitudinal_companies: null,
    known_outcomes: null,
    proposals_pending: null,
    verified_claims: null,
    evidence_level_distribution: null,
    stale_connectors: null,
    report_grounding: null,
    report_grounding_kpi: null,
    mrr_cents: null,
    paying_orgs: null,
  };
}

const p = (row: FunnelEventRow, key: string): unknown => (row.params && typeof row.params === "object" ? (row.params as Record<string, unknown>)[key] : undefined);
const actor = (row: FunnelEventRow): string => row.user_id ?? row.session_id ?? row.event_id ?? "";

function distinct(rows: readonly FunnelEventRow[], name: string, keyOf: (r: FunnelEventRow) => string | undefined = actor, where: (r: FunnelEventRow) => boolean = () => true): number {
  const set = new Set<string>();
  for (const r of rows) {
    if (r.event_name !== name || !where(r)) continue;
    const k = keyOf(r);
    if (k) set.add(k);
  }
  return set.size;
}

function count(rows: readonly FunnelEventRow[], name: string, where: (r: FunnelEventRow) => boolean = () => true): number {
  let n = 0;
  for (const r of rows) if (r.event_name === name && where(r)) n += 1;
  return n;
}

function sum(rows: readonly FunnelEventRow[], name: string, key: string, where: (r: FunnelEventRow) => boolean = () => true): number {
  let n = 0;
  for (const r of rows) {
    if (r.event_name !== name || !where(r)) continue;
    const v = Number(p(r, key));
    if (Number.isFinite(v)) n += v;
  }
  return n;
}

/** 0.85 → "85%" (labels only; the value column formats the ratio itself). */
const pctLabel = (ratio: number): string => `${Math.round(ratio * 100)}%`;

const projectOf = (r: FunnelEventRow) => (typeof p(r, "project_id") === "string" ? (p(r, "project_id") as string) : undefined);
const isPaidPilot = (r: FunnelEventRow) => p(r, "pilot_source") === "paid";
const isDeck = (r: FunnelEventRow) => p(r, "evidence_kind") === "pitch_deck";

/**
 * Pure: the six FI sections for a window of analytics_events rows (QA rows
 * dropped here) plus the DB / snapshot counts the reader supplies.
 */
export function reduceInstitutional(rowsIn: readonly FunnelEventRow[], db: InstitutionalDbCounts = emptyDbCounts()): FiSection[] {
  const rows = rowsIn.filter((r) => !isQaRow(r));
  const live = (key: string, label: string, value: number | null, note: string, unit: FiMetric["unit"] = "count"): FiMetric => ({ key, label, value, unit, status: "live", note });
  const later = (key: string, label: string, status: Exclude<FiMetricStatus, "live">, note: string, unit: FiMetric["unit"] = "count"): FiMetric => ({ key, label, value: null, unit, status, note });

  const startupsImported = new Set<string>();
  for (const r of rows) {
    if (r.event_name === "website_imported" || (r.event_name === "evidence_upload" && isDeck(r))) {
      const k = projectOf(r) ?? actor(r);
      if (k) startupsImported.add(k);
    }
  }
  const pilotRevenue = sum(rows, "pilot_started", "amount_cents", isPaidPilot);
  const mrr = db.mrr_cents;
  const arr = mrr === null ? null : mrr * 12;
  const arpa = mrr !== null && db.paying_orgs !== null && db.paying_orgs > 0 ? Math.round(mrr / db.paying_orgs) : null;

  return [
    {
      key: "acquisition",
      label: "Acquisition",
      metrics: [
        live("program_leads", "Program leads", db.program_leads, "leads (source contact) with payload topic pilot / sales / partnership in the window (legacy topic pilot rows kept; the form now offers sales / partnership)"),
        later("programs_page_views", "Programs page views", "p1", "GA4 page_view is client-side only; a server page_view for /solutions/accelerator lands with P1"),
        live("demos", "Demo requests", db.demo_leads, "leads rows with topic demo"),
        live("cohort_proposals", "Cohort proposals sent", db.cohort_proposals, "validation-tracker entries at Level 3+ with proposal_generated_at (the Cohort proposal PDF from /admin/validation, G25)"),
        live("paid_pilots", "Paid pilots started (retired)", count(rows, "pilot_started", isPaidPilot), "historical pilot_started rows with pilot_source = paid — the paid pilot was retired 2026-09-21 (G25); evaluators start a Cohort plan instead (subscription_created)"),
      ],
    },
    {
      key: "activation",
      label: "Activation",
      metrics: [
        live("startups_imported", "Startups imported", startupsImported.size, "distinct projects with website_imported or a pitch-deck evidence_upload"),
        live("first_assessments", "First assessments", distinct(rows, "svi_score_computed", projectOf), "distinct project_id on svi_score_computed"),
        live("evaluator_cohort_views", "Evaluator views cohort", distinct(rows, "cohort_action"), "distinct evaluators on cohort_action (typed; the cohort view emits it from P2)"),
        live("founder_evidence", "Founder adds evidence", distinct(rows, "evidence_upload", projectOf), "distinct projects with an evidence_upload"),
      ],
    },
    {
      key: "engagement",
      label: "Engagement",
      metrics: [
        live("rescores", "Re-scores", count(rows, "score_recalculated"), "score_recalculated (emitted by the P1 rescore path; 0 until then is a real 0)"),
        live("evidence_updates", "Evidence updates", count(rows, "evidence_upload"), "evidence_upload events"),
        live("evaluator_dossier_views", "Evaluator dossier views", distinct(rows, "dossier_view"), "distinct evaluators on dossier_view (login proxy until P1 adds evaluator_login)"),
        later("comparison_sessions", "Comparison sessions", "p2", "cohort compare view (P2-B)"),
      ],
    },
    {
      key: "revenue",
      label: "Revenue",
      metrics: [
        live("pilot_revenue", "Pilot revenue (retired)", pilotRevenue, "historical sum of pilot_started.amount_cents where pilot_source = paid — no new rows since G25 (2026-09-21)", "aud_cents"),
        live("mrr", "MRR", mrr, "traction-snapshot.json mrr_aud_cents.from_subscriptions (v_mrr_active definition)", "aud_cents"),
        live("arr", "ARR", arr, "MRR × 12 (annualised subscription revenue)", "aud_cents"),
        live("arpa", "ARPA", arpa, "MRR ÷ paying evaluator organisations", "aud_cents"),
        live("renewals", "Subscription renewals", count(rows, "subscription_renewed"), "subscription_renewed (invoice.paid renewal hook)"),
      ],
    },
    {
      key: "trust",
      label: "Trust",
      metrics: [
        live("verified_claims", "Verified claims", db.verified_claims, "svi_dimension_evidence rows with confidence_level = third_party_verified"),
        live("evidence_verified_events", "Evidence verified (window)", count(rows, "evidence_verified"), "evidence_verified events (reviewer approvals emit from P1)"),
        later("evidence_level_distribution", "Evidence level distribution", "p1", "per-level share across live evidence rows — the Assessment Card (P1) publishes it"),
        live("stale_connectors", "Stale connectors", db.stale_connectors, `active connections (project × provider) whose last read is older than ${STALE_AFTER_DAYS} days — their EvidenceRecords have expired`),
        live("report_grounding", `Report grounding / KPI ${db.report_grounding_kpi === null ? "n/a" : pctLabel(db.report_grounding_kpi)}`, db.report_grounding, "groundedShare of the latest Trusted Business Report run (tbr-quality.jsonl; /api/status tbr_quality.grounded_share) — the G19 / G23-A target is ≥ KPI on every run", "ratio"),
      ],
    },
    {
      key: "data_moat",
      label: "Data moat",
      metrics: [
        live("companies", "Companies", db.companies, "projects rows"),
        live("snapshots", "Snapshots", db.snapshots, "svi_snapshots rows"),
        live("evidence_records", "Evidence records", db.evidence_records, "svi_dimension_evidence rows"),
        live("claim_evidence_records", "Claim evidence records", db.claim_evidence_records, "evidence_records rows (0417 Claim ≠ Evidence graph)"),
        live("longitudinal_companies", `Longitudinal companies (≥ 2 snapshots ≥ ${LONGITUDINAL_MIN_GAP_DAYS} d apart)`, db.longitudinal_companies, "projects whose earliest and latest svi_snapshots are ≥ 30 days apart (bounded scan)"),
        live("known_outcomes", "Known outcomes (confirmed)", db.known_outcomes, "startup_outcomes rows with status confirmed (0427 outcome ledger, P3-A)"),
        live("proposals_pending", "Outcome proposals pending", db.proposals_pending, "startup_outcomes rows with status proposed — awaiting a person's confirmation"),
      ],
    },
  ];
}

// ── North Star ────────────────────────────────────────────────────────

export interface BatchItemRow {
  batch_id: string;
  scored_at: string | null;
  status?: string | null;
}
export interface BatchRow {
  id: string;
  user_id: string;
  /** G24-C (0436): the fictional demo cohort — never an assessed startup. */
  is_demo?: boolean | null;
}
export interface OwnerRow {
  id: string;
  plan: string | null;
  email?: string | null;
  /** True when the owner holds an active paid pilot (pilot_orders, P0-C). */
  paid_pilot?: boolean;
}

export interface NorthStar {
  /** "YYYY-MM" (UTC). */
  month: string;
  /** Startups assessed through paying institutional workflows in the month. */
  assessed: number;
  /** All batch items scored in the month, paying or not. */
  assessed_all: number;
  paying_batches: number;
  paying_orgs: number;
  /** Which part of the join was unavailable, if any. */
  partial: string | null;
}

export function monthString(now: number | Date): string {
  return dayString(now, 0).slice(0, 7);
}

/** True when the owner's plan (or an active paid pilot) counts as a paying institutional workflow. */
export function isPayingInstitutional(owner: Pick<OwnerRow, "plan" | "paid_pilot"> | undefined): boolean {
  if (!owner) return false;
  if (owner.paid_pilot) return true;
  return !!owner.plan && PAYING_INSTITUTIONAL_PLANS.includes(owner.plan);
}

/**
 * Pure: batch items scored in `month` whose batch owner is on a paying
 * institutional plan (or an active paid pilot). QA owners (qa-live-*) are
 * excluded through `isQaOwner`.
 */
export function computeNorthStar(
  items: readonly BatchItemRow[],
  batches: readonly BatchRow[],
  owners: readonly OwnerRow[],
  month: string,
  opts: { isQaOwner?: (o: OwnerRow) => boolean; partial?: string | null } = {},
): NorthStar {
  const isQa = opts.isQaOwner ?? ((o) => /^qa-live-/i.test(o.email ?? ""));
  const ownerById = new Map(owners.map((o) => [o.id, o] as const));
  const batchOwner = new Map(batches.map((b) => [b.id, ownerById.get(b.user_id)] as const));
  const demoBatches = new Set(batches.filter((b) => b.is_demo === true).map((b) => b.id));
  let assessed = 0;
  let assessedAll = 0;
  const payingBatches = new Set<string>();
  const payingOrgs = new Set<string>();
  for (const it of items) {
    if (!it.scored_at || it.scored_at.slice(0, 7) !== month) continue;
    if (it.status && it.status !== "done") continue;
    // G24-C: the demo cohort's five fictional startups are never "assessed".
    if (demoBatches.has(it.batch_id)) continue;
    const owner = batchOwner.get(it.batch_id);
    if (owner && isQa(owner)) continue;
    assessedAll += 1;
    if (!isPayingInstitutional(owner)) continue;
    assessed += 1;
    payingBatches.add(it.batch_id);
    if (owner) payingOrgs.add(owner.id);
  }
  return { month, assessed, assessed_all: assessedAll, paying_batches: payingBatches.size, paying_orgs: payingOrgs.size, partial: opts.partial ?? null };
}

// ── Reader (fail-soft) ────────────────────────────────────────────────

/** The slice of supabase-js the reader needs (mockable). */
export interface InstitutionalClient {
  from: (table: string) => { select: (cols: string, opts?: { count?: "exact"; head?: boolean }) => InstitutionalQuery };
}
export interface InstitutionalQuery {
  in: (col: string, v: readonly string[]) => InstitutionalQuery;
  gte: (col: string, v: string) => InstitutionalQuery;
  eq: (col: string, v: unknown) => InstitutionalQuery;
  limit: (n: number) => InstitutionalQuery;
  order: (col: string, opts: { ascending: boolean }) => InstitutionalQuery;
  then: PromiseLike<InstitutionalResult>["then"];
}
export interface InstitutionalResult {
  data: unknown[] | null;
  count?: number | null;
  error: { message?: string } | null;
}

export function asInstitutionalClient(client: unknown): InstitutionalClient | null {
  return client ? (client as InstitutionalClient) : null;
}

export interface InstitutionalFunnel {
  window: { days: number; from: string; to: string };
  sections: FiSection[];
  northStar: NorthStar | null;
  warnings: string[];
}

export const FI_WINDOW_DAYS = 28;
export const FI_ROW_LIMIT = 20_000;

async function safe<T>(warnings: string[], label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    warnings.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

async function countRows(client: InstitutionalClient, warnings: string[], label: string, refine: (q: InstitutionalQuery) => PromiseLike<InstitutionalResult> = (q) => q): Promise<number | null> {
  const table = label.split(":")[0]!;
  const res = await safe(warnings, label, async () => await refine(client.from(table).select("id", { count: "exact", head: true })));
  if (!res) return null;
  if (res.error) {
    warnings.push(`${label}: ${res.error.message ?? "query failed"}`);
    return null;
  }
  return typeof res.count === "number" ? res.count : null;
}

/**
 * Everything /admin/funnel's institutional section shows. Never throws: a
 * failed query becomes a null metric + a warning.
 */
export async function readInstitutionalFunnel(client: InstitutionalClient | null, now: number = Date.now(), root: string = getStatusRoot()): Promise<InstitutionalFunnel> {
  const warnings: string[] = [];
  const from = dayString(now, FI_WINDOW_DAYS);
  const to = dayString(now, 0);
  const db = emptyDbCounts();
  let rows: FunnelEventRow[] = [];
  let northStar: NorthStar | null = null;

  // Traction snapshot → MRR + paying orgs + counts that already exist there.
  const snap = await readJsonFile<Record<string, unknown>>(root, `${REPORTS_DIR}/traction-snapshot.json`);
  if (snap) {
    const mrr = (snap.mrr_aud_cents as Record<string, unknown> | undefined)?.from_subscriptions;
    db.mrr_cents = typeof mrr === "number" ? mrr : null;
    const byPlan = (snap.evaluators as Record<string, unknown> | undefined)?.paying_by_plan as Record<string, number> | undefined;
    db.paying_orgs = byPlan ? Object.values(byPlan).reduce((a, b) => a + (Number(b) || 0), 0) : null;
  } else {
    warnings.push("traction-snapshot.json: missing — MRR / ARR / ARPA unavailable");
  }

  // G25 — Cohort proposals sent: validation-tracker entries carrying proposal_generated_at (the ledger file; fail-soft).
  const tracker = await readJsonFile<{ entries?: Array<{ proposal_generated_at?: string | null }> }>(root, `${REPORTS_DIR}/validation-tracker.json`);
  db.cohort_proposals = tracker && Array.isArray(tracker.entries) ? tracker.entries.filter((e) => typeof e?.proposal_generated_at === "string" && e.proposal_generated_at.length > 0).length : null;
  if (!tracker) warnings.push("validation-tracker.json: missing — Cohort proposals unavailable");

  // G23-C — report grounding (latest run) + KPI from the live-checkout jsonl; fail-soft (null share, KPI kept).
  const grounding = await readTbrGrounding(root);
  db.report_grounding = grounding.grounded_share;
  db.report_grounding_kpi = grounding.grounded_share_kpi;
  if (grounding.grounded_share === null) warnings.push("tbr-quality.jsonl: no pipeline run logged — report grounding unavailable");

  if (!client) {
    warnings.push("supabase not configured");
    return { window: { days: FI_WINDOW_DAYS, from, to }, sections: reduceInstitutional([], db), northStar: null, warnings };
  }

  // analytics_events in the window (same shape as the founder funnel).
  const ev = await safe(warnings, "analytics_events", async () =>
    client.from("analytics_events").select("event_id, event_name, user_id, session_id, params, ts, source").in("event_name", FI_FUNNEL_EVENT_NAMES).gte("ts", `${from}T00:00:00.000Z`).order("ts", { ascending: true }).limit(FI_ROW_LIMIT),
  );
  if (ev?.error) warnings.push(`analytics_events: ${ev.error.message ?? "query failed"}`);
  else if (ev?.data) {
    rows = rowsInWindow(ev.data as FunnelEventRow[], { days: FI_WINDOW_DAYS, now, includeToday: true });
    if (ev.data.length >= FI_ROW_LIMIT) warnings.push(`analytics_events: capped at ${FI_ROW_LIMIT} rows`);
  }

  // Leads (program / demo) in the window.
  // leads.topic lives in payload->>topic (api/lead/route.ts sets it for source = contact).
  db.program_leads = await countRows(client, warnings, "leads:program", (q) => q.eq("source", "contact").in("payload->>topic", ["pilot", "sales", "partnership"]).gte("created_at", `${from}T00:00:00.000Z`));
  db.demo_leads = await countRows(client, warnings, "leads:demo", (q) => q.eq("source", "contact").eq("payload->>topic", "demo").gte("created_at", `${from}T00:00:00.000Z`));

  // Data moat + trust counts (all-time).
  db.companies = await countRows(client, warnings, "projects:count");
  db.snapshots = await countRows(client, warnings, "svi_snapshots:count");
  db.evidence_records = await countRows(client, warnings, "svi_dimension_evidence:count");
  // G21 P3-A — the Claim ≠ Evidence graph + the outcome ledger (a missing 0417 / 0427 table reads as null, never 0).
  db.claim_evidence_records = await countRows(client, warnings, "evidence_records:count");
  db.known_outcomes = await countRows(client, warnings, "startup_outcomes:confirmed", (q) => q.eq("status", "confirmed"));
  db.proposals_pending = await countRows(client, warnings, "startup_outcomes:proposed", (q) => q.eq("status", "proposed"));
  db.verified_claims = await countRows(client, warnings, "svi_dimension_evidence:verified", (q) => q.eq("confidence_level", "third_party_verified"));

  // G21 P3-C — stale connectors: bounded scan of the v2 vault, folded per
  // (project, provider) against the proof TTL by the shared freshness rule.
  const conns = await safe(warnings, "oauth_connections_v2:stale", async () => client.from("oauth_connections_v2").select("project_id, provider, status, last_sync_at, updated_at").in("status", ["active", "error"]).limit(FI_ROW_LIMIT));
  if (conns?.error) warnings.push(`oauth_connections_v2:stale: ${conns.error.message ?? "query failed"}`);
  else if (conns?.data) {
    db.stale_connectors = countStaleConnectors(conns.data as Array<{ project_id: string | null; provider: string; status: string; last_sync_at: string | null; updated_at: string | null }>, now);
    if (conns.data.length >= FI_ROW_LIMIT) warnings.push(`oauth_connections_v2:stale: capped at ${FI_ROW_LIMIT} rows`);
  }

  // Longitudinal companies: bounded scan of (project_id, snapshot_date) — ≥ 2 snapshots ≥ 30 d apart (G21 P3-A, lib/outcomes/data-moat).
  const snaps = await safe(warnings, "svi_snapshots:longitudinal", async () => client.from("svi_snapshots").select("project_id, snapshot_date").order("snapshot_date", { ascending: false }).limit(FI_ROW_LIMIT));
  if (snaps?.error) warnings.push(`svi_snapshots:longitudinal: ${snaps.error.message ?? "query failed"}`);
  else if (snaps?.data) {
    db.longitudinal_companies = computeLongitudinal(snaps.data as SnapshotDateRow[]);
    if (snaps.data.length >= FI_ROW_LIMIT) warnings.push(`svi_snapshots:longitudinal: capped at ${FI_ROW_LIMIT} rows`);
  }

  // North Star: batch items scored this month × batch owner plan.
  const month = monthString(now);
  const items = await safe(warnings, "evaluation_batch_items", async () => client.from("evaluation_batch_items").select("batch_id, scored_at, status").gte("scored_at", `${month}-01T00:00:00.000Z`).order("scored_at", { ascending: true }).limit(FI_ROW_LIMIT));
  if (items?.error) warnings.push(`evaluation_batch_items: ${items.error.message ?? "query failed"}`);
  else if (items?.data) {
    const itemRows = items.data as BatchItemRow[];
    const batchIds = [...new Set(itemRows.map((i) => i.batch_id))];
    let batches: BatchRow[] = [];
    let owners: OwnerRow[] = [];
    let partial: string | null = null;
    if (batchIds.length > 0) {
      // G24-C: `is_demo` (0436) first; a 42703 before the migration falls back to the two-column read.
      let b = await safe(warnings, "evaluation_batches", async () => client.from("evaluation_batches").select("id, user_id, is_demo").in("id", batchIds).limit(FI_ROW_LIMIT));
      if (b?.error && /is_demo|42703/i.test(b.error.message ?? "")) {
        b = await safe(warnings, "evaluation_batches", async () => client.from("evaluation_batches").select("id, user_id").in("id", batchIds).limit(FI_ROW_LIMIT));
      }
      if (b?.error || !b?.data) partial = "evaluation_batches unavailable — owner plans unknown";
      else batches = b.data as BatchRow[];
      const userIds = [...new Set(batches.map((x) => x.user_id))];
      if (userIds.length > 0) {
        const u = await safe(warnings, "app_users", async () => client.from("app_users").select("id, plan, email").in("id", userIds).limit(FI_ROW_LIMIT));
        if (u?.error || !u?.data) partial = partial ?? "app_users unavailable — owner plans unknown";
        else owners = u.data as OwnerRow[];
        // G25: pilot_orders is a retired read-only ledger — a paying
        // institutional workflow is an owner plan only (isPayingInstitutional).
      }
    }
    northStar = computeNorthStar(itemRows, batches, owners, month, { partial });
  }

  return { window: { days: FI_WINDOW_DAYS, from, to }, sections: reduceInstitutional(rows, db), northStar, warnings };
}
