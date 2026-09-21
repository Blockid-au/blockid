// Score → outcome calibration — pure maths (G21 P3-A; score-governance § 7
// n-rules, § 13 "Outcome calibration").
//
// Question answered: among companies assessed at T0, how often did a
// CONFIRMED outcome follow, by the SVI band and by the Evidence Confidence
// band they were in at T0? Published per cohort (stage × the quarter of T0)
// under the benchmark n-rules (lib/benchmarks/publication-rules.ts):
//
//   cohort < 10 companies        → not published (counted as suppressed)
//   band n 10–29                 → rate labelled "indicative", no interval
//   band n ≥ 30                  → rate + Wilson 95 % interval
//
// Definitions
//   T0             the company's EARLIEST snapshot inside the cohort quarter
//   eligible       T0 is ≥ HORIZON_DAYS (90) before `now` — the company has
//                  had the follow-up window; younger companies are excluded
//                  from the denominator, never counted as "no outcome"
//   positive       a confirmed outcome observed ≥ HORIZON_DAYS after T0
//                  (any kind; per-kind counts ride along)
//
// What this is NOT: a forecast for one company. The words the page and the
// JSON use are "association", "observed rate", "interval" — never a
// forecasting or exactness claim (lib/marketing/messaging.test.ts guards
// the public copy; the `limitations` block is published verbatim).

import { benchmarkBand, BENCHMARK_BASIC_N, BENCHMARK_MIN_N, type BenchmarkBand } from "@/lib/benchmarks/publication-rules";

export const CALIBRATION_METHOD_VERSION = "1.0.0";
export const HORIZON_DAYS = 90;
export const COHORT_MIN_COMPANIES = BENCHMARK_MIN_N;
export const CI_MIN_N = BENCHMARK_BASIC_N;

export type SviBand = "early" | "developing" | "strong";
export type ConfidenceBand = "low" | "mid" | "high";

export const SVI_BANDS: readonly SviBand[] = Object.freeze(["early", "developing", "strong"]);
export const CONFIDENCE_BANDS: readonly ConfidenceBand[] = Object.freeze(["low", "mid", "high"]);

/** Same cut-points as the report band (report-visuals palette bandFor): < 40 early · 40–69 developing · ≥ 70 strong. */
export function sviBand(svi: number): SviBand {
  if (svi >= 70) return "strong";
  if (svi >= 40) return "developing";
  return "early";
}

/** Evidence Confidence 0–100: < 40 low · 40–69 mid · ≥ 70 high (the Assessment Card meter colours). */
export function confidenceBand(c: number): ConfidenceBand {
  if (c >= 70) return "high";
  if (c >= 40) return "mid";
  return "low";
}

export interface CalibrationSnapshotInput {
  project_id: string;
  snapshot_date: string;
  svi_total: number | null;
  evidence_confidence: number | null;
  stage: number | null;
}

export interface CalibrationOutcomeInput {
  project_id: string;
  kind: string;
  observed_at: string;
  status: string;
  source?: string | null;
  recorded_by?: string | null;
  confirmed_by?: string | null;
}

/**
 * Review P1 (2026-09-21): only outcomes confirmed by someone other than the
 * founder who declared them enter the calibration — a self-declared,
 * self-confirmed "raised a round" is a survivorship claim, not an
 * observation. Connector / register / evaluator / admin sources pass as long
 * as they are confirmed; founder-source rows need a different confirmer.
 */
export function isCalibrationEligibleOutcome(o: CalibrationOutcomeInput): boolean {
  if (o.status !== "confirmed") return false;
  if (o.source === "founder") return Boolean(o.confirmed_by) && o.confirmed_by !== o.recorded_by;
  return true;
}

export interface CalibrationInput {
  snapshots: readonly CalibrationSnapshotInput[];
  outcomes: readonly CalibrationOutcomeInput[];
  now: Date;
  horizonDays?: number;
}

export interface WilsonInterval {
  low: number;
  high: number;
}

/** Wilson score interval for a proportion (z = 1.96). Pure; returns null for n = 0. */
export function wilson95(positives: number, n: number): WilsonInterval | null {
  if (n <= 0) return null;
  const z = 1.959964;
  const p = positives / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { low: Math.max(0, round4(centre - half)), high: Math.min(1, round4(centre + half)) };
}

function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}

export interface BandCell {
  band: string;
  n: number;
  positives: number;
  /** positives / n, 4 dp; null when the band is below the publication floor. */
  rate: number | null;
  /** Wilson 95 % interval; only when n ≥ CI_MIN_N. */
  ci95: WilsonInterval | null;
  publication: BenchmarkBand;
  label: string;
}

export interface CohortResult {
  key: string;
  stage: number;
  /** "2026-Q1" — the quarter of T0. */
  period: string;
  companies: number;
  positives: number;
  outcome_rate: number | null;
  ci95: WilsonInterval | null;
  by_svi_band: BandCell[];
  by_confidence_band: BandCell[];
  /** Confidence bands are only computed over companies whose T0 snapshot carries evidence_confidence. */
  companies_with_confidence: number;
  outcomes_by_kind: Record<string, number>;
  published: boolean;
}

export interface CalibrationReport {
  generated_at: string;
  method_version: string;
  svi_version: string;
  git_sha: string;
  horizon_days: number;
  totals: {
    companies_with_snapshot: number;
    companies_eligible: number;
    companies_with_outcome: number;
    confirmed_outcomes: number;
    cohorts_total: number;
    cohorts_published: number;
    cohorts_suppressed: number;
  };
  cohorts: CohortResult[];
  limitations: string[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function quarterOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
}

function bandLabel(n: number, rate: number | null, band: BenchmarkBand): string {
  if (band === "none") return `not enough companies (n = ${n})`;
  const pct = rate === null ? "—" : `${Math.round(rate * 100)}%`;
  return band === "indicative" ? `${pct} indicative (n = ${n})` : `${pct} (n = ${n})`;
}

function cell(band: string, n: number, positives: number): BandCell {
  const pub = benchmarkBand(n);
  const rate = pub === "none" ? null : round4(positives / n);
  const ci = n >= CI_MIN_N ? wilson95(positives, n) : null;
  return { band, n, positives, rate, ci95: ci, publication: pub, label: bandLabel(n, rate, pub) };
}

export const CALIBRATION_LIMITATIONS: readonly string[] = Object.freeze([
  "This is an association between the band a company was in at its first snapshot of the quarter and whether a confirmed outcome followed at least 90 days later. It describes the companies on the BlockID record; it is not a forecast for any one company.",
  "Only confirmed outcomes count, and an outcome a founder recorded about their own company counts only when BlockID or an evaluator confirmed it — never the founder alone. An outcome nobody recorded or confirmed is counted as no outcome, so every rate is a floor on what happened, not a measurement of everything that happened.",
  "Companies younger than the 90-day horizon are excluded from the denominator rather than counted as 'no outcome'.",
  "Cohorts are stage × quarter of the first snapshot. A cohort with fewer than 10 companies is not published; a band with 10–29 companies is labelled indicative and carries no interval; an interval (Wilson 95 %) is shown from 30 companies.",
  "Founders choose whether to add evidence; companies that keep their record current are more likely to record outcomes. The bands are therefore not a random sample of Australian startups.",
  "Every snapshot in a cohort is scored on one methodology version; a cohort is never mixed across versions. The version and the engine commit are printed with the numbers.",
]);

/** Pure — see the module header. Deterministic order: cohorts by period then stage. */
export function computeCalibration(input: CalibrationInput, meta: { sviVersion: string; gitSha: string }): CalibrationReport {
  const horizon = input.horizonDays ?? HORIZON_DAYS;
  const nowMs = input.now.getTime();
  const eligibleCutoff = nowMs - horizon * DAY_MS;

  // Per project, per quarter → earliest snapshot (T0).
  type T0 = { project_id: string; ms: number; svi: number; confidence: number | null; stage: number; period: string };
  const t0ByKey = new Map<string, T0>();
  const projectsWithSnapshot = new Set<string>();
  for (const s of input.snapshots) {
    const ms = Date.parse(s.snapshot_date);
    if (!Number.isFinite(ms) || typeof s.svi_total !== "number" || !Number.isFinite(s.svi_total) || typeof s.stage !== "number") continue;
    projectsWithSnapshot.add(s.project_id);
    const period = quarterOf(ms);
    const key = `${s.project_id}|${period}`;
    const cur = t0ByKey.get(key);
    if (!cur || ms < cur.ms) {
      t0ByKey.set(key, { project_id: s.project_id, ms, svi: s.svi_total, confidence: typeof s.evidence_confidence === "number" && Number.isFinite(s.evidence_confidence) ? s.evidence_confidence : null, stage: s.stage, period });
    }
  }

  // Confirmed outcomes per project, sorted.
  const outcomesByProject = new Map<string, Array<{ ms: number; kind: string }>>();
  let confirmedOutcomes = 0;
  for (const o of input.outcomes) {
    if (!isCalibrationEligibleOutcome(o)) continue;
    const ms = Date.parse(o.observed_at);
    if (!Number.isFinite(ms)) continue;
    confirmedOutcomes += 1;
    outcomesByProject.set(o.project_id, [...(outcomesByProject.get(o.project_id) ?? []), { ms, kind: o.kind }]);
  }

  // Group eligible T0s into cohorts.
  type Member = T0 & { positive: boolean; kinds: string[] };
  const cohorts = new Map<string, Member[]>();
  const eligibleProjects = new Set<string>();
  const projectsWithOutcome = new Set<string>();
  for (const t of t0ByKey.values()) {
    if (t.ms > eligibleCutoff) continue;
    eligibleProjects.add(t.project_id);
    const after = (outcomesByProject.get(t.project_id) ?? []).filter((o) => o.ms - t.ms >= horizon * DAY_MS);
    const positive = after.length > 0;
    if (positive) projectsWithOutcome.add(t.project_id);
    const key = `${t.period}|${t.stage}`;
    cohorts.set(key, [...(cohorts.get(key) ?? []), { ...t, positive, kinds: [...new Set(after.map((o) => o.kind))] }]);
  }

  const results: CohortResult[] = [];
  for (const [key, members] of cohorts) {
    const [period, stageStr] = key.split("|");
    const stage = Number(stageStr);
    const companies = members.length;
    const positives = members.filter((m) => m.positive).length;
    const published = companies >= COHORT_MIN_COMPANIES;
    const bySvi = SVI_BANDS.map((b) => {
      const inBand = members.filter((m) => sviBand(m.svi) === b);
      return cell(b, inBand.length, inBand.filter((m) => m.positive).length);
    });
    const withConf = members.filter((m) => m.confidence !== null);
    const byConf = CONFIDENCE_BANDS.map((b) => {
      const inBand = withConf.filter((m) => confidenceBand(m.confidence as number) === b);
      return cell(b, inBand.length, inBand.filter((m) => m.positive).length);
    });
    const kinds: Record<string, number> = {};
    for (const m of members) for (const k of m.kinds) kinds[k] = (kinds[k] ?? 0) + 1;
    const overall = cell("all", companies, positives);
    results.push({
      key,
      stage,
      period: period!,
      companies,
      positives,
      outcome_rate: published ? overall.rate : null,
      ci95: published ? overall.ci95 : null,
      by_svi_band: published ? bySvi : bySvi.map((c) => ({ ...c, rate: null, ci95: null, publication: "none" as const, label: `not enough companies (n = ${c.n})` })),
      by_confidence_band: published ? byConf : byConf.map((c) => ({ ...c, rate: null, ci95: null, publication: "none" as const, label: `not enough companies (n = ${c.n})` })),
      companies_with_confidence: withConf.length,
      outcomes_by_kind: kinds,
      published,
    });
  }
  results.sort((a, b) => a.period.localeCompare(b.period) || a.stage - b.stage);

  return {
    generated_at: input.now.toISOString(),
    method_version: CALIBRATION_METHOD_VERSION,
    svi_version: meta.sviVersion,
    git_sha: meta.gitSha,
    horizon_days: horizon,
    totals: {
      companies_with_snapshot: projectsWithSnapshot.size,
      companies_eligible: eligibleProjects.size,
      companies_with_outcome: projectsWithOutcome.size,
      confirmed_outcomes: confirmedOutcomes,
      cohorts_total: results.length,
      cohorts_published: results.filter((r) => r.published).length,
      cohorts_suppressed: results.filter((r) => !r.published).length,
    },
    cohorts: results,
    limitations: [...CALIBRATION_LIMITATIONS],
  };
}

/** One history line per run (JSONL). */
export function calibrationHistoryLine(r: CalibrationReport): string {
  return JSON.stringify({
    generated_at: r.generated_at,
    method_version: r.method_version,
    svi_version: r.svi_version,
    git_sha: r.git_sha,
    companies_eligible: r.totals.companies_eligible,
    confirmed_outcomes: r.totals.confirmed_outcomes,
    cohorts_published: r.totals.cohorts_published,
    cohorts_suppressed: r.totals.cohorts_suppressed,
  });
}
