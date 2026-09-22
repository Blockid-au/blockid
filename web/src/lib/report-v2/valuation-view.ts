import { isValuationAvailable } from "./schema";
// valuation-view — the one view-model behind the ReportV2 valuation chapter
// on the web (components/tbr/v2/valuation.tsx), the PDF (lib/pdf/tbr-pdf.tsx)
// and the DOCX (lib/docx/tbr-docx.ts) so the three twins print the same
// content (G19-S42). Pure, client-safe, localised through tbr-strings.
//
//   inputRows      "Inputs & assumptions" — label / value / source chip
//   methodRows     ONLY applicable methods (+ derivation); `hiddenNeedRevenue`
//                  counts the revenue methods that did not run
//   unitEconomics  rows when the chapter carries the CFO block
//   crossChecks    backtest quartile + stage baseline lines
//   consistency    consistency-gate notes
//   askLine        only when the founder stated a cap / raise

import { getTbrValuationStrings, type TbrValuationStrings } from "@/lib/i18n/tbr-strings";
import { aud } from "@/lib/report-visuals";
import type { ValuationChapter, ValuationMethodKey } from "./schema";

export type ValuationSourceChip = keyof TbrValuationStrings["source"];

export interface ValuationInputRow {
  key: string;
  label: string;
  value: string;
  source: ValuationSourceChip;
}

export interface ValuationMethodRowView {
  method: ValuationMethodKey;
  label: string;
  lowAud: number;
  midAud: number;
  highAud: number;
  weightPct: number;
  rationale: string;
  derivation: string | null;
}

export interface ValuationCrossCheckRow {
  label: string;
  range: string;
  source: string;
  asOf: string;
  n: number | null;
}

export interface ValuationView {
  available: boolean;
  reason: string | null;
  strings: TbrValuationStrings;
  confidencePct: number | null;
  inputRows: ValuationInputRow[];
  methodRows: ValuationMethodRowView[];
  /** Revenue methods that did not run (pre-revenue) — drives the "N methods need revenue" line. */
  hiddenNeedRevenue: number;
  /** true when no method at all ran (read-time adapter fallback). */
  noneApplicable: boolean;
  needRevenueLine: string | null;
  unitEconomics: Array<{ key: string; label: string; value: string }>;
  crossChecks: ValuationCrossCheckRow[];
  consistency: string[];
  scenarioLine: string;
  askLine: string | null;
  sectorMultiplesTitle: string;
  sectorMultiplesLine: string;
  comparablesLine: string;
}

const REVENUE_METHODS: readonly ValuationMethodKey[] = ["revenue_multiple", "dcf_proxy", "comparables", "risk_factor_summation"];

/** `/workspace/evidence/connectors` — where Stripe / Xero connect (Evidence hub tab; the settings path never existed — gate-8 link check 2026-09-20). */
export const CONNECTORS_HREF = "/workspace/evidence/connectors";

function pct(n: number): string {
  return `${n > 0 ? "+" : ""}${n}%`;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function buildValuationView(v: import("./schema").AvailableValuationChapter, locale?: string): ValuationView & { available: true; confidencePct: number };
export function buildValuationView(v: ValuationChapter, locale?: string): ValuationView;
export function buildValuationView(v: ValuationChapter, locale: string | undefined = "en"): ValuationView {
  const s = getTbrValuationStrings(locale);
  if (!isValuationAvailable(v)) return { available: false, reason: v.reason, strings: s, confidencePct: null,
    inputRows: [], methodRows: [], hiddenNeedRevenue: 0, noneApplicable: true, needRevenueLine: null,
    unitEconomics: [], crossChecks: [], consistency: [], scenarioLine: "", askLine: null,
    sectorMultiplesTitle: "", sectorMultiplesLine: "", comparablesLine: "" };
  const inputs = v.inputs;
  const revenueChip: ValuationSourceChip = inputs ? inputs.revenueSource : "none";

  const inputRows: ValuationInputRow[] = [];
  if (inputs) {
    const hasRevenue = inputs.arrAud > 0;
    inputRows.push({ key: "mrr", label: s.inMrr, value: hasRevenue ? aud(inputs.mrrAud) : s.notProvided, source: hasRevenue ? revenueChip : "none" });
    inputRows.push({ key: "arr", label: s.inArr, value: hasRevenue ? aud(inputs.arrAud) : s.notProvided, source: hasRevenue ? revenueChip : "none" });
    if (typeof inputs.monthlyGrowthRatePct === "number") {
      inputRows.push({ key: "growth", label: s.inGrowth, value: `${inputs.monthlyGrowthRatePct}% / ${locale === "vi" ? "tháng" : "month"}`, source: revenueChip === "none" ? "founder_stated" : revenueChip });
    } else if (inputs.growthAssumed) {
      inputRows.push({ key: "growth", label: s.inGrowth, value: s.inGrowthAssumedValue(inputs.assumedGrowthRatePct ?? 0), source: "assumed" });
    } else {
      inputRows.push({ key: "growth", label: s.inGrowth, value: s.notProvided, source: "none" });
    }
    inputRows.push({ key: "esic", label: s.inEsic, value: inputs.esicQualifies ? s.yes : s.no, source: inputs.esicQualifies ? "founder_stated" : "none" });
    inputRows.push({ key: "rdti", label: s.inRdti, value: inputs.rdtiRefundAud > 0 ? aud(inputs.rdtiRefundAud) : s.notProvided, source: inputs.rdtiRefundAud > 0 ? "founder_stated" : "none" });
    const pillars = (Object.keys(inputs.berkusPillars) as Array<keyof typeof inputs.berkusPillars>).filter((k) => inputs.berkusPillars[k]);
    inputRows.push({ key: "berkus", label: s.inBerkus, value: `${pillars.length}/5 — ${pillars.map((k) => s.pillar[k]).join(", ")}`, source: "model" });
    inputRows.push({ key: "stage", label: s.inStage, value: typeof inputs.sviStage === "number" ? `${inputs.stage} (SVI ${inputs.sviStage})` : inputs.stage, source: "model" });
    inputRows.push({ key: "sector", label: s.inSector, value: inputs.sector, source: "model" });
    inputRows.push({
      key: "multiples",
      label: s.inSectorMultiples,
      value: `${inputs.sectorMultipleLow}× / ${inputs.sectorMultipleMedian ?? v.sectorMultiples.median}× / ${inputs.sectorMultipleHigh}×`,
      source: "benchmark",
    });
    inputRows.push({ key: "raise", label: s.inRaise, value: inputs.raiseStated && typeof inputs.raiseAud === "number" ? aud(inputs.raiseAud) : s.raiseNotStated, source: inputs.raiseStated ? "founder_stated" : "none" });
  }

  const applicable = v.methods.filter((m) => m.applicable);
  const methodRows: ValuationMethodRowView[] = applicable.map((m) => ({
    method: m.method,
    label: s.method[m.method],
    lowAud: m.lowAud,
    midAud: m.midAud,
    highAud: m.highAud,
    weightPct: Math.round(m.weight * 100),
    rationale: m.rationale,
    derivation: v.derivation?.[m.method] ?? null,
  }));
  const hiddenNeedRevenue = v.methods.filter((m) => !m.applicable && REVENUE_METHODS.includes(m.method)).length;
  const noneApplicable = applicable.length === 0;

  const ue = v.unitEconomics ?? null;
  const unitEconomics: ValuationView["unitEconomics"] = [];
  if (ue) {
    const cac = num(ue.cacAud);
    const ltv = num(ue.ltvAud);
    const ratio = num(ue.ltvCacRatio);
    const gm = num(ue.grossMarginPct);
    const r40 = num(ue.ruleOf40);
    const payback = num(ue.cacPaybackMonths);
    const verdict = typeof ue.verdict === "string" && ue.verdict in s.ueVerdict ? (ue.verdict as keyof TbrValuationStrings["ueVerdict"]) : null;
    if (cac !== null && cac > 0) unitEconomics.push({ key: "cacAud", label: s.ue.cacAud, value: aud(cac) });
    if (ltv !== null && ltv > 0) unitEconomics.push({ key: "ltvAud", label: s.ue.ltvAud, value: aud(ltv) });
    if (ratio !== null && ratio > 0) unitEconomics.push({ key: "ltvCacRatio", label: s.ue.ltvCacRatio, value: `${ratio}×` });
    if (gm !== null) unitEconomics.push({ key: "grossMarginPct", label: s.ue.grossMarginPct, value: `${gm}%` });
    if (r40 !== null) unitEconomics.push({ key: "ruleOf40", label: s.ue.ruleOf40, value: String(r40) });
    if (payback !== null) unitEconomics.push({ key: "cacPaybackMonths", label: s.ue.cacPaybackMonths, value: String(payback) });
    if (verdict) unitEconomics.push({ key: "verdict", label: s.ue.verdict, value: s.ueVerdict[verdict] });
  }

  const crossChecks: ValuationCrossCheckRow[] = (v.crossChecks ?? []).map((c) => {
    const parts = [c.lowAud, c.midAud, c.highAud].filter((x): x is number => typeof x === "number");
    const range = typeof c.lowAud === "number" && typeof c.highAud === "number" && typeof c.midAud === "number"
      ? `${aud(c.lowAud)} – ${aud(c.midAud)} – ${aud(c.highAud)}`
      : parts.length
        ? aud(parts[0])
        : "—";
    return { label: c.label, range, source: c.source, asOf: c.asOf, n: typeof c.n === "number" ? c.n : null };
  });

  const askLine = v.ask ? s.askLine(aud(v.ask.preMoneyAud), aud(v.ask.raiseAud), s.askVerdict[v.ask.verdict], pct(v.ask.gapPct)) : null;

  return {
    available: true, reason: null, strings: s,
    confidencePct: Math.round(v.consensus.confidence * 100),
    inputRows,
    methodRows,
    hiddenNeedRevenue,
    noneApplicable,
    needRevenueLine: !noneApplicable && hiddenNeedRevenue > 0 ? s.needRevenue(hiddenNeedRevenue) : null,
    unitEconomics,
    crossChecks,
    consistency: [...(v.consistencyNotes ?? [])],
    scenarioLine: s.scenarioLine(aud(v.scenarios.bear), aud(v.scenarios.base), aud(v.scenarios.bull)),
    askLine,
    sectorMultiplesTitle: s.sectorMultiplesTitle(v.sectorMultiples.sector),
    sectorMultiplesLine: s.sectorMultiplesLine(v.sectorMultiples.low, v.sectorMultiples.median, v.sectorMultiples.high, v.sectorMultiples.sourceLabel, v.sectorMultiples.sourceDate),
    comparablesLine: s.comparablesLine(v.comparables.n, v.comparables.withMultiplesN, v.sectorMultiples.sourceDate),
  };
}
