// Track B B8 — portfolio phase-distribution aggregator (pure).
//
// Given the same portfolioSviRaw + attributedCustomers rows already fetched
// by /reseller (the dashboard page), derive one row per phase (1..12) with
// the count of customers whose *current* journey position falls into that
// phase. Uses the shared PHASE_LABELS taxonomy so the chart bins align with
// /guide/[chapter], /guide/reports, /showcase/blockid, the B7 product tour
// and the B8 customer-drawer deep-links.
//
// Derivation rule per customer (deterministic, low-fidelity but honest —
// the reseller boundary intentionally excludes finer-grained workspace
// state):
//
//   - No SVI analysis on file → Phase 1 (Vision / Day-0 Idea)
//   - Latest SVI score in 0-20    → Phase 2 (Idea Validation)
//   - Latest SVI score in 21-40   → Phase 3 (Market Research)
//   - Latest SVI score in 41-60   → Phase 4 (MVP / Product Discovery)
//   - Latest SVI score in 61-80   → Phase 5 (PMF / Early Traction)
//   - Latest SVI score in 81-100  → Phase 6 (Revenue / Business Model)
//   - Phases 7-12 stay at zero until we surface milestone-report-state
//     into the reseller view (deferred with the rest of P10 hardening).
//
// k>=5 anonymity + complementary suppression applied per bucket via the
// existing helpers in portfolio-aggregates.ts — U.15.3 privacy contract
// preserved across every reseller-lens aggregate.

import { PHASE_LABELS, PHASE_COUNT, type PhaseLabel } from "@/lib/showcase/gallery";
import {
  applyComplementarySuppression,
  type KAnonBucket,
  K_ANONYMITY_THRESHOLD,
} from "./portfolio-aggregates";

export interface PhaseDistributionBucket extends KAnonBucket {
  phase: number;        // 1..12
  label: PhaseLabel;    // shared PHASE_LABELS entry (EN + VI)
}

export interface PhaseDistributionInput {
  customers: { user_id: string }[];
  svi: { project_id: string; score: number | null; created_at: string }[];
  /** map customer user_id → owned project_ids; when omitted, every SVI row is treated as visible */
  projectsByUser?: Record<string, string[]>;
  k?: number;
}

interface ScoreBand {
  phase: number;
  lo: number;
  hi: number;
}

const SCORE_BANDS: readonly ScoreBand[] = [
  { phase: 2, lo: 0, hi: 20 },
  { phase: 3, lo: 21, hi: 40 },
  { phase: 4, lo: 41, hi: 60 },
  { phase: 5, lo: 61, hi: 80 },
  { phase: 6, lo: 81, hi: 100 },
];

function bandForScore(score: number): number | null {
  for (const b of SCORE_BANDS) {
    if (score >= b.lo && score <= b.hi) return b.phase;
  }
  return null;
}

/**
 * Latest SVI score per project, oldest-first input tolerated — we compare
 * timestamps rather than trusting order so the caller can hand us the same
 * portfolioSviRaw() rows already used by buildSviBands().
 */
function latestScoreByProject(
  svi: PhaseDistributionInput["svi"],
): Map<string, number> {
  const latest = new Map<string, { score: number; ts: number }>();
  for (const row of svi) {
    if (typeof row.score !== "number" || !row.project_id) continue;
    const ts = new Date(row.created_at).getTime();
    if (!Number.isFinite(ts)) continue;
    const cur = latest.get(row.project_id);
    if (!cur || ts > cur.ts) latest.set(row.project_id, { score: row.score, ts });
  }
  const out = new Map<string, number>();
  for (const [pid, { score }] of latest) out.set(pid, score);
  return out;
}

/**
 * Bin every attributed customer into one of 12 phases and apply k-anonymity
 * per bucket (with complementary suppression once the array is materialised).
 * Empty buckets are still emitted so the chart renders all 12 axes; k-anon
 * turns zero into `count: 0, suppressed: false` (below-threshold suppression
 * only fires for 1..k-1).
 */
export function buildPhaseDistribution(
  input: PhaseDistributionInput,
): PhaseDistributionBucket[] {
  const k = input.k ?? K_ANONYMITY_THRESHOLD;
  const scoreByProject = latestScoreByProject(input.svi);

  const counts = new Map<number, number>();
  for (let p = 1; p <= PHASE_COUNT; p += 1) counts.set(p, 0);

  for (const c of input.customers) {
    const projects = input.projectsByUser?.[c.user_id] ?? Array.from(scoreByProject.keys());
    let best: number | null = null;
    for (const pid of projects) {
      const s = scoreByProject.get(pid);
      if (typeof s !== "number") continue;
      const phase = bandForScore(s);
      if (phase == null) continue;
      if (best == null || phase > best) best = phase;
    }
    const phase = best ?? 1; // no scored project → still counted at Vision
    counts.set(phase, (counts.get(phase) ?? 0) + 1);
  }

  const raw: PhaseDistributionBucket[] = [];
  for (let phase = 1; phase <= PHASE_COUNT; phase += 1) {
    const count = counts.get(phase) ?? 0;
    if (count > 0 && count < k) {
      raw.push({ phase, label: PHASE_LABELS[phase], count: null, suppressed: true });
    } else {
      raw.push({ phase, label: PHASE_LABELS[phase], count, suppressed: false });
    }
  }
  return applyComplementarySuppression(raw);
}
