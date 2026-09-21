// computed-facts — G24-D: the platform's own computed numbers as citable
// evidence rows.
//
// The 09:02 UTC showcase run (snapshot 136a49f5, groundedShare 0.50) showed
// the writers quoting figures the pipeline itself produced — the SVI index and
// dimension scores, the stage benchmark quartiles, the CFO consensus
// valuation — with nothing in the register to cite, so every such sentence
// was an uncited material claim and the critic (which only saw the raw
// description + scores) called them fabricated. These three rows carry stable
// deterministic ids (evidenceIdFor("calc|…"), uuid-shaped so the dispatch
// input schema, the claim gate, the auto-citer and ai_runs all accept them),
// sit in every criterion catalogue, every chapter's evidence table and the
// appendix register, and spell each number both exactly and rounded so the
// auto-citer matches whichever form the model wrote.
//
// Pure: no I/O, no model call.

import type { EvidenceRow, ReportV2 } from "@/lib/report-v2/schema";
import type { SVIAnalysis } from "@/lib/svi-analysis";
import { benchmarkFor, benchmarkStageForSvi, DIM_ORDER, DIMENSION_OWNERS, type DimKey } from "./dimension-owners";
import { evidenceIdFor } from "./evidence-ids";

export type ComputedFactKind = "svi-scores" | "benchmarks" | "valuation" | "au-context";

export interface ComputedFact {
  kind: ComputedFactKind;
  evidence_id: string;
  label: string;
  content: string;
}

/** Stable ids — the same on every run, for every startup. */
export const COMPUTED_FACT_IDS: Record<ComputedFactKind, string> = {
  "svi-scores": evidenceIdFor("calc|svi-scores"),
  benchmarks: evidenceIdFor("calc|benchmarks"),
  valuation: evidenceIdFor("calc|valuation"),
  "au-context": evidenceIdFor("calc|au-context"),
};

/** Labels start with a source word the auto-citer recognises (svi / benchmarks / valuation). */
export const COMPUTED_FACT_LABELS: Record<ComputedFactKind, string> = {
  "svi-scores": "SVI scores (computed by the platform)",
  benchmarks: "Benchmarks: stage quartiles p25 / p50 / p75 (computed)",
  valuation: "Valuation: CFO 5-method consensus (computed)",
  "au-context": "AU context: R&D Tax Incentive / ESIC / GST rates (platform knowledge)",
};

/**
 * The Australian programme facts the agent prompts themselves state (agent-prompts.ts
 * AU_CONTEXT: "R&D Tax Incentive (43.5%)", CFO / CLO briefs) — the 09:02 showcase run
 * quoted "43.5%" in three sections with nothing to cite. One row, one id; the
 * numbers are the platform's, not the founder's, so the label says so.
 */
export const AU_CONTEXT_FACTS =
  "R&D Tax Incentive (R&DTI): 43.5% refundable tax offset on eligible R&D spend for companies with aggregated turnover under A$20M (corporate rate 25% + 18.5 percentage points); non-refundable offset above A$20M turnover; registration with AusIndustry within 10 months of year end. " +
  "ESIC (Early Stage Innovation Company): investors receive a 20% non-refundable carry-forward tax offset capped at A$200,000 per investor per year and a modified CGT exemption for shares held 1–10 years; eligibility via the 100-point innovation test or the principles test. " +
  "GST: 10% on taxable supplies in Australia. Company tax rate: 25% for base-rate entities (turnover under A$50M).";

export const COMPUTED_FACT_ID_SET: ReadonlySet<string> = new Set(Object.values(COMPUTED_FACT_IDS));

export function isComputedFactId(id: string): boolean {
  return COMPUTED_FACT_ID_SET.has(id);
}

export interface ComputedFactsInput {
  sviAnalysis: Pick<SVIAnalysis, "totalSVI" | "stageLabel" | "subs"> & { dimensionScores?: Record<string, number> };
  stage: number;
  valuationChapter?: ReportV2["valuation"] | null;
}

/** "A$4,622,000 (≈A$4.6M)" — exact and rounded spellings so either form the model writes is matched. */
export function formatAudBoth(n: number): string {
  const exact = `A$${Math.round(n).toLocaleString("en-AU")}`;
  const abs = Math.abs(n);
  let approx: string;
  if (abs >= 1_000_000_000) approx = `A$${(n / 1_000_000_000).toFixed(1)}bn`;
  else if (abs >= 1_000_000) approx = `A$${(n / 1_000_000).toFixed(1)}M`;
  else if (abs >= 1_000) approx = `A$${Math.round(n / 1_000)}K`;
  else return exact;
  return `${exact} (≈${approx})`;
}

function dimScore(input: ComputedFactsInput, dim: DimKey): number | null {
  const fromMap = input.sviAnalysis.dimensionScores?.[dim];
  if (typeof fromMap === "number" && Number.isFinite(fromMap)) return Math.round(fromMap);
  const sub = input.sviAnalysis.subs?.find((s) => s.key === dim);
  return sub && Number.isFinite(sub.value) ? Math.round(sub.value) : null;
}

const METHOD_LABEL: Record<string, string> = {
  revenue_multiple: "Revenue multiple",
  berkus: "Berkus",
  dcf_proxy: "DCF proxy",
  comparables: "Comparables",
  risk_factor_summation: "Risk factor summation",
  scorecard: "Scorecard",
  stage_baseline: "Stage baseline",
};

/** The computed rows for this run — always the SVI scores + benchmarks, plus the valuation when the CFO model ran. */
export function computedFacts(input: ComputedFactsInput): ComputedFact[] {
  const out: ComputedFact[] = [];
  const stageLabel = input.sviAnalysis.stageLabel || `stage ${input.stage}`;

  const dims = DIM_ORDER.map((dim) => {
    const s = dimScore(input, dim);
    return `${dim.toUpperCase()} (${DIMENSION_OWNERS[dim].title}) ${s === null ? "pending" : `${s}/100`}`;
  });
  out.push({
    kind: "svi-scores",
    evidence_id: COMPUTED_FACT_IDS["svi-scores"],
    label: COMPUTED_FACT_LABELS["svi-scores"],
    content: `SVI index ${Math.round(input.sviAnalysis.totalSVI)} (open-ended, base 100); stage ${stageLabel}. Dimension scores: ${dims.join("; ")}.`,
  });

  const benchStage = benchmarkStageForSvi(input.stage);
  const bench = DIM_ORDER.map((dim) => {
    const b = benchmarkFor(dim, benchStage);
    const s = dimScore(input, dim);
    const delta = s === null ? "" : `, ${s - b.p50 >= 0 ? "+" : "−"}${Math.abs(s - b.p50)} points vs the p50 median`;
    return `${dim.toUpperCase()} p25 ${b.p25} / p50 ${b.p50} / p75 ${b.p75}${delta}`;
  });
  out.push({
    kind: "benchmarks",
    evidence_id: COMPUTED_FACT_IDS.benchmarks,
    label: COMPUTED_FACT_LABELS.benchmarks,
    content: `Stage benchmarks for ${stageLabel} (svi-dimension-benchmarks, per dimension, /100): ${bench.join("; ")}.`,
  });

  out.push({ kind: "au-context", evidence_id: COMPUTED_FACT_IDS["au-context"], label: COMPUTED_FACT_LABELS["au-context"], content: AU_CONTEXT_FACTS });

  const v = input.valuationChapter;
  if (v && v.consensus) {
    const c = v.consensus;
    const methods = (v.methods ?? [])
      .filter((m) => m.applicable)
      .map((m) => `${METHOD_LABEL[m.method] ?? m.method} mid ${formatAudBoth(m.midAud)} (range ${formatAudBoth(m.lowAud)}–${formatAudBoth(m.highAud)}, weight ${Math.round(m.weight * 100)}%)`);
    const ask = v.ask ? ` Founder ask: pre-money ${formatAudBoth(v.ask.preMoneyAud)}, raise ${formatAudBoth(v.ask.raiseAud)} — ${v.ask.verdict.replace(/_/g, " ")} (${v.ask.gapPct >= 0 ? "+" : ""}${Math.round(v.ask.gapPct)}% vs consensus).` : "";
    out.push({
      kind: "valuation",
      evidence_id: COMPUTED_FACT_IDS.valuation,
      label: COMPUTED_FACT_LABELS.valuation,
      content: `Consensus valuation ${formatAudBoth(c.lowAud)}–${formatAudBoth(c.highAud)}, mid ${formatAudBoth(c.midAud)}, confidence ${Math.round(c.confidence * 100)}%.${methods.length ? ` Methods: ${methods.join("; ")}.` : ""}${ask}`,
    });
  }
  return out;
}

/** The same facts as appendix / chapter evidence rows (every dimension may cite them). */
export function computedFactRows(input: ComputedFactsInput, at = new Date().toISOString()): EvidenceRow[] {
  return computedFacts(input).map((f) => ({
    evidence_id: f.evidence_id,
    source: "connector_other",
    label: f.label,
    status: "partial",
    observedAt: at,
    value: f.content,
    dims: [...DIM_ORDER],
  }));
}
