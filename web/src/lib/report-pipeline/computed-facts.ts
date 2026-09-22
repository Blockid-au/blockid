import { isValuationAvailable } from "@/lib/report-v2/schema";
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

import { trademarkFeeRange } from "@/lib/agents/clo-compliance";
import { lookupByAnzsic, searchByKeyword, type AuIndustrySnapshot } from "@/lib/market/au-market-lookup";
import type { EvidenceRow, ReportV2 } from "@/lib/report-v2/schema";
import type { SVIAnalysis } from "@/lib/svi-analysis";
import { deriveIndustryKeyword, extractAnzsicCode } from "./au-market-anchor";
import { benchmarkFor, benchmarkStageForSvi, DIM_ORDER, DIMENSION_OWNERS, type DimKey } from "./dimension-owners";
import { evidenceIdFor } from "./evidence-ids";

// G28-A: two more knowledge rows for the residual uncited patterns of the
// 11:34 UTC showcase run (groundedShare 0.82): the CLO quoting an ASIC annual
// review fee and a trade mark class fee with nothing to cite ("au-legal"), and
// the CMO deriving a market-entity count from an anchor that was never in the
// register ("sector-entities" — present only when the AU market anchor matched
// an industry; absent otherwise, and the owner prompt says not to invent one).
// Every row now carries a provenance line the critic sees (orchestrator
// criticEvidenceFor) so a platform figure is never called fabricated.
export type ComputedFactKind = "svi-scores" | "benchmarks" | "valuation" | "au-context" | "saas-benchmarks" | "au-legal" | "sector-entities";

export interface ComputedFact {
  kind: ComputedFactKind;
  evidence_id: string;
  label: string;
  content: string;
  /** G28-A: where the numbers come from (module or public source URL). */
  provenance: string;
}

/** Stable ids — the same on every run, for every startup. */
export const COMPUTED_FACT_IDS: Record<ComputedFactKind, string> = {
  "svi-scores": evidenceIdFor("calc|svi-scores"),
  benchmarks: evidenceIdFor("calc|benchmarks"),
  valuation: evidenceIdFor("calc|valuation"),
  "au-context": evidenceIdFor("calc|au-context"),
  "saas-benchmarks": evidenceIdFor("calc|saas-benchmarks"),
  "au-legal": evidenceIdFor("calc|au-legal"),
  "sector-entities": evidenceIdFor("calc|sector-entities"),
};

/** Labels start with a source word the auto-citer recognises (svi / benchmarks / valuation / asic / sector). */
export const COMPUTED_FACT_LABELS: Record<ComputedFactKind, string> = {
  "svi-scores": "SVI scores (computed by the platform)",
  benchmarks: "Benchmarks: stage quartiles p25 / p50 / p75 (computed)",
  valuation: "Valuation: CFO 5-method consensus (computed)",
  "au-context": "AU context: R&D Tax Incentive / ESIC / GST rates (platform knowledge)",
  "saas-benchmarks": "Benchmarks: SaaS funnel and AU ARR bands (platform knowledge)",
  "au-legal": "ASIC and IP Australia fees: annual review fee band, trade mark fee per class (platform knowledge)",
  "sector-entities": "Sector entity count: active AU businesses in the anchored industry (ABS 8165.0, via the AU market anchor)",
};

/** ASIC's fee schedule (annual review, late payment). */
export const ASIC_FEES_URL = "https://asic.gov.au/for-business/payments-fees-and-invoices/asic-fees/fees-for-commonly-lodged-documents/";
/** IP Australia's trade mark fee page (per class). */
export const IP_AUSTRALIA_FEES_URL = "https://www.ipaustralia.gov.au/trade-marks/understanding-trade-marks/trade-mark-costs";

/**
 * G28-A: the provenance line the critic sees next to each row — the module
 * that computed the number, or the public source the knowledge band was taken
 * from. Plain text, one line each.
 */
export const COMPUTED_FACT_PROVENANCE: Record<ComputedFactKind, string> = {
  "svi-scores": "computed by svi-analysis.ts for this startup (deterministic — the same inputs give the same score)",
  benchmarks: "svi-dimension-benchmarks ANCHORS via report-pipeline/dimension-owners.ts benchmarkFor — stage quartiles, not measured for this startup",
  valuation: "report-pipeline/valuation-chapter.ts — the CFO 5-method consensus computed for this startup",
  "au-context": "platform knowledge — ATO R&D Tax Incentive and ESIC pages (ato.gov.au), GST Act; rates as published, not measured for this startup",
  "saas-benchmarks": "platform rule of thumb (report-pipeline/agent-prompts.ts CRO template) — sector-typical bands, not measured for this startup",
  "au-legal": `platform knowledge — ${ASIC_FEES_URL} and ${IP_AUSTRALIA_FEES_URL}; statutory bands indexed each 1 July, the current-year figure is on the source page`,
  "sector-entities": "ABS 8165.0 Counts of Australian Businesses basis via lib/market/au-market-lookup.ts — the whole anchored industry, never a subset of it",
};

/**
 * G28-A: the statutory fee band the CLO template leans on. The 11:34 showcase
 * run wrote "pay the $290 fee on time" and "~$250 per class via IP Australia"
 * with nothing to cite, and the critic called the trade mark cost invented.
 * No constant in lib/legal or lib/compliance carries the ASIC figure
 * (compliance/calendar.ts only holds the review URL); clo-compliance.ts has
 * trademarkFeeRange(). So: one knowledge row, its source URLs inside, the
 * ASIC figure as the published band (indexed every 1 July) — never a single
 * "current" number the row cannot vouch for.
 */
export const AU_LEGAL_FACTS = (() => {
  const [tmLow, tmHigh] = trademarkFeeRange();
  return (
    `ASIC annual review fee (proprietary company, s 345A Corporations Act 2001): A$321 (FY2024-25) to A$329 (FY2025-26) a year, indexed each 1 July — the current-year figure is at ${ASIC_FEES_URL}; a special-purpose company pays a reduced fee (about A$67). Late payment fee: about A$96 within one month, about A$401 after one month. The annual statement is issued on the registration anniversary and the fee is due within 2 months. ` +
    `IP Australia trade mark application fee: A$${tmLow}–A$${tmHigh} per class (A$${tmLow} for a standard online filing with a pick-list specification, up to A$${tmHigh} with a custom specification) — ${IP_AUSTRALIA_FEES_URL}. Two classes (e.g. class 36 financial services + class 42 software) therefore cost A$${(tmLow * 2).toLocaleString("en-AU")}–A$${(tmHigh * 2).toLocaleString("en-AU")} to file.`
  );
})();

/**
 * The SaaS funnel / ARR benchmark bands the CRO template itself states
 * (agent-prompts.ts "Funnel Analysis" + "AU Market Revenue Benchmarks") — run 3's
 * customer_size section quoted "Series A: A$500k–A$3m ARR (median A$1.2m)" and
 * the 2–5% / 15–30% / 60–80% funnel columns with nothing to cite. Rules of
 * thumb, labelled as the platform's, one id.
 */
export const SAAS_BENCHMARK_FACTS =
  "SaaS funnel benchmarks (platform rule of thumb, not measured for this startup): awareness → trial 2–5%; trial → paid 15–30%; paid → retained at 90 days 60–80%. Net Revenue Retention target above 100% (world-class above 120%). " +
  "AU SaaS ARR bands by stage: Seed A$0–A$500k ARR (A$0–A$500,000) typical; Series A A$500k–A$3m ARR (A$500,000–A$3,000,000), median A$1.2m (A$1,200,000); Series B A$3m–A$15m ARR (A$3,000,000–A$15,000,000).";

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
  /** G28-A: the founder text the AU market anchor is derived from (ReportContext.rawText) — the sector-entities row exists only when an industry matches. */
  rawText?: string;
  /** G28-A: the market criterion text joins the lookup, as agent-dispatcher auMarketAnchorText does. */
  criteriaData?: { market?: { textInput?: string | null } | null };
}

/** The industry the AU market anchor resolves for this startup (au-market-anchor.ts precedence: ANZSIC code in the text, else keyword), or null. */
export function sectorEntitiesFor(input: Pick<ComputedFactsInput, "rawText" | "criteriaData">): AuIndustrySnapshot | null {
  const text = `${input.rawText ?? ""}\n${input.criteriaData?.market?.textInput ?? ""}`;
  if (!text.trim()) return null;
  const code = extractAnzsicCode(text);
  const keyword = deriveIndustryKeyword(text);
  return (code && lookupByAnzsic(code)) || (keyword ? (searchByKeyword(keyword, 1)[0] ?? null) : null);
}

/** "8,400 (≈8.4k)" — exact and rounded spellings of a business count so either form the model writes is matched. */
export function formatCountBoth(n: number): string {
  const exact = Math.round(n).toLocaleString("en-AU");
  if (n >= 1000) return `${exact} (≈${String(Math.round(n / 100) / 10)}k)`;
  return exact;
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
    provenance: COMPUTED_FACT_PROVENANCE["svi-scores"],
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
    provenance: COMPUTED_FACT_PROVENANCE.benchmarks,
    content: `Stage benchmarks for ${stageLabel} (svi-dimension-benchmarks, per dimension, /100): ${bench.join("; ")}.`,
  });

  out.push({ kind: "au-context", evidence_id: COMPUTED_FACT_IDS["au-context"], label: COMPUTED_FACT_LABELS["au-context"], provenance: COMPUTED_FACT_PROVENANCE["au-context"], content: AU_CONTEXT_FACTS });
  out.push({ kind: "saas-benchmarks", evidence_id: COMPUTED_FACT_IDS["saas-benchmarks"], label: COMPUTED_FACT_LABELS["saas-benchmarks"], provenance: COMPUTED_FACT_PROVENANCE["saas-benchmarks"], content: SAAS_BENCHMARK_FACTS });
  out.push({ kind: "au-legal", evidence_id: COMPUTED_FACT_IDS["au-legal"], label: COMPUTED_FACT_LABELS["au-legal"], provenance: COMPUTED_FACT_PROVENANCE["au-legal"], content: AU_LEGAL_FACTS });

  // G28-A: the sector entity count — only when the AU market anchor matched an
  // industry. Both spellings of the count, and a plain statement of what the
  // row is NOT (any subset such as "roughly 1,400 that actively screen"), so
  // the owner declares such a subset as an estimate instead of citing this row.
  const sector = sectorEntitiesFor(input);
  if (sector) {
    const src = sector.sources[0];
    out.push({
      kind: "sector-entities",
      evidence_id: COMPUTED_FACT_IDS["sector-entities"],
      label: COMPUTED_FACT_LABELS["sector-entities"],
      provenance: COMPUTED_FACT_PROVENANCE["sector-entities"],
      content: `Sector entity count: ${formatCountBoth(sector.businessCount)} active Australian businesses in ${sector.label} (ANZSIC ${sector.anzsicCode}), ABS 8165.0 basis${src ? ` — source: ${src.publisher}, ${src.title} (${src.publishedYear}) ${src.url}` : ""}. This is the whole industry; any subset of it (a SAM counted in entities, "the organisations that actively screen startups") is not measured and must be written as a declared estimate.`,
    });
  }

  const v = input.valuationChapter;
  if (v && isValuationAvailable(v)) {
    const c = v.consensus;
    const methods = (v.methods ?? [])
      .filter((m) => m.applicable)
      .map((m) => `${METHOD_LABEL[m.method] ?? m.method} mid ${formatAudBoth(m.midAud)} (range ${formatAudBoth(m.lowAud)}–${formatAudBoth(m.highAud)}, weight ${Math.round(m.weight * 100)}%)`);
    const ask = v.ask ? ` Founder ask: pre-money ${formatAudBoth(v.ask.preMoneyAud)}, raise ${formatAudBoth(v.ask.raiseAud)} — ${v.ask.verdict.replace(/_/g, " ")} (${v.ask.gapPct >= 0 ? "+" : ""}${Math.round(v.ask.gapPct)}% vs consensus).` : "";
    out.push({
      kind: "valuation",
      evidence_id: COMPUTED_FACT_IDS.valuation,
      label: COMPUTED_FACT_LABELS.valuation,
      provenance: COMPUTED_FACT_PROVENANCE.valuation,
      content: `Consensus valuation ${formatAudBoth(c.lowAud)}–${formatAudBoth(c.highAud)}, mid ${formatAudBoth(c.midAud)}, confidence ${Math.round(c.confidence * 100)}%.${methods.length ? ` Methods: ${methods.join("; ")}.` : ""}${ask}`,
    });
  }
  return out;
}

/** Kinds that are public references rather than platform computations. */
const KNOWLEDGE_KINDS: ReadonlySet<ComputedFactKind> = new Set(["au-context", "saas-benchmarks", "au-legal", "sector-entities"]);

/** The same facts as appendix / chapter evidence rows (every dimension may cite them). */
export function computedFactRows(input: ComputedFactsInput, at = new Date().toISOString()): EvidenceRow[] {
  return computedFacts(input).map((f) => ({
    evidence_id: f.evidence_id,
    // Review v3.27.0 P2: knowledge rows (AU context, SaaS bands, AU legal
    // fees, sector entity counts) are public references, not the founder's
    // connected data — the appendix must not print "Data connector" for them.
    // The two computed rows (scores, benchmarks) are the platform's own maths.
    source: KNOWLEDGE_KINDS.has(f.kind) ? "external" : "connector_other",
    label: f.label,
    status: "partial",
    observedAt: at,
    value: f.content,
    dims: [...DIM_ORDER],
  }));
}
