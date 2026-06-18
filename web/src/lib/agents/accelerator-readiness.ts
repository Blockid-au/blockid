// Accelerator readiness evaluation (T0226).
//
// Given an SVIAnalysis, score the user against every active row in
// knowledge_entries and return a heatmap: per source × per criterion.
//
// Status per criterion:
//   "met"     — evidence matches what the criterion requires
//   "partial" — partial match (e.g. founder profile filled but missing advisors)
//   "gap"     — no evidence yet
//
// Status detection is deterministic — keyword scan over the rawInput + signals.
// Not perfect, but explainable and re-runnable as the data improves.

import type { SVIAnalysis } from "@/lib/svi-analysis";
import { getSupabaseAdmin } from "@/lib/supabase";

export type CriterionStatus = "met" | "partial" | "gap";

export interface KnowledgeEntry {
  id: string;
  source: string;
  source_name: string;
  topic: string;
  criterion: string;
  description: string | null;
  stage_min: number;
  stage_max: number;
  sector: string;
  evidence_required: string[];
  tactic: string[];
  valuation_lift_pct: number;
  citations: string[];
}

export interface CriterionEvaluation {
  entry: KnowledgeEntry;
  status: CriterionStatus;
  reasoning: string;
  estLiftAud?: number; // valuation_lift_pct applied to the user's blended valuation
}

export interface SourceReadiness {
  source: string;
  source_name: string;
  total: number;
  met: number;
  partial: number;
  gap: number;
  pct: number; // (met + partial * 0.5) / total
  topCriteria: CriterionEvaluation[]; // 3 highest-leverage gaps
}

export interface AcceleratorReadiness {
  sources: SourceReadiness[];
  totalCriteria: number;
  totalMet: number;
  totalPartial: number;
  overallPct: number;
  highLeverageGaps: CriterionEvaluation[]; // top 5 across all sources by valuation_lift_pct
  generatedAt: string;
}

// ─── Detection rules (per topic) ────────────────────────────────────────────

function detectStatus(
  entry: KnowledgeEntry,
  analysis: SVIAnalysis,
  blob: string,
): { status: CriterionStatus; reasoning: string } {
  const lower = blob.toLowerCase();
  const topic = entry.topic;
  const subs = Object.fromEntries((analysis.subs ?? []).map((s) => [s.key, s.value]));

  // Antler signals already computed — use them when they exist
  const antler = analysis.antlerSignals;
  const antlerSignal = antler?.signals.find((s) => s.key === topic);

  // Topic-specific heuristics
  switch (topic) {
    case "team":
      if (antlerSignal?.score && antlerSignal.score >= 70) return { status: "met", reasoning: `Antler Team signal ${antlerSignal.score}/100` };
      if (antlerSignal?.score && antlerSignal.score >= 45) return { status: "partial", reasoning: `Antler Team signal ${antlerSignal.score}/100` };
      // Look for explicit founder-profile signals
      if (/ex-stripe|ex-canva|ex-atlassian|ex-google|previously built|founder of/i.test(blob)) return { status: "met", reasoning: "Brand-name employer or ship history detected" };
      if (/co-founder|co founder/i.test(lower)) return { status: "partial", reasoning: "Co-founder mentioned" };
      return { status: "gap", reasoning: "No ship history / ex-employer / advisor evidence found" };

    case "progress":
      if (antlerSignal?.score && antlerSignal.score >= 70) return { status: "met", reasoning: `Antler Progress signal ${antlerSignal.score}/100` };
      if (antlerSignal?.score && antlerSignal.score >= 45) return { status: "partial", reasoning: `Antler Progress signal ${antlerSignal.score}/100` };
      if ((subs.tre ?? 0) >= 60) return { status: "met", reasoning: `TRE dimension ${subs.tre}/100` };
      if ((subs.tre ?? 0) >= 40) return { status: "partial", reasoning: `TRE dimension ${subs.tre}/100` };
      return { status: "gap", reasoning: "No revenue / customer / partnership evidence" };

    case "invention":
      if (antlerSignal?.score && antlerSignal.score >= 60) return { status: "met", reasoning: `Antler Invention signal ${antlerSignal.score}/100` };
      if (antlerSignal?.score && antlerSignal.score >= 35) return { status: "partial", reasoning: `Antler Invention signal ${antlerSignal.score}/100` };
      if (/patent|proprietary|novel algorithm|breakthrough/i.test(blob)) return { status: "met", reasoning: "IP / proprietary tech keyword detected" };
      return { status: "gap", reasoning: "No patent / IP / novel-tech keyword" };

    case "vision":
      if (antlerSignal?.score && antlerSignal.score >= 70) return { status: "met", reasoning: `Antler Vision signal ${antlerSignal.score}/100` };
      if (antlerSignal?.score && antlerSignal.score >= 45) return { status: "partial", reasoning: `Antler Vision signal ${antlerSignal.score}/100` };
      if (/future of|category-defining|roadmap/i.test(lower)) return { status: "partial", reasoning: "Vision language detected, no full thesis doc" };
      return { status: "gap", reasoning: "No vision / category-defining narrative" };

    case "product_10x":
      if (antlerSignal?.score && antlerSignal.score >= 70) return { status: "met", reasoning: `Antler 10× Product signal ${antlerSignal.score}/100` };
      if (antlerSignal?.score && antlerSignal.score >= 45) return { status: "partial", reasoning: `Antler 10× Product signal ${antlerSignal.score}/100` };
      if (/10x|10×|100x|state-of-the-art|benchmark/i.test(lower)) return { status: "partial", reasoning: "10× claim made, no benchmark to back it" };
      return { status: "gap", reasoning: "No 10× / benchmark / state-of-the-art claim" };

    case "governance":
      if ((subs.cgh ?? 0) >= 70 && (subs.iri ?? 0) >= 60) return { status: "met", reasoning: `CGH ${subs.cgh}/100, IRI ${subs.iri}/100` };
      if ((subs.cgh ?? 0) >= 50) return { status: "partial", reasoning: `CGH ${subs.cgh}/100` };
      return { status: "gap", reasoning: "ESOP / vesting / cap table evidence weak" };
  }

  return { status: "gap", reasoning: "No matching signal" };
}

// ─── Public entry ───────────────────────────────────────────────────────────

export async function evaluateAcceleratorReadiness(
  analysis: SVIAnalysis,
  rawInput: string,
): Promise<AcceleratorReadiness | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const stage = analysis.stage ?? 0;
  const { data: rows } = await supabase
    .from("knowledge_entries")
    .select("*")
    .eq("active", true)
    .lte("stage_min", stage)
    .gte("stage_max", stage);

  if (!rows || rows.length === 0) return null;

  const blob = [
    rawInput,
    analysis.inputSummary?.snippet ?? "",
    analysis.inputSummary?.keyFindings?.join(" ") ?? "",
  ].join(" ");

  const blendedMid = analysis.deepValuation?.blendedValuation?.midAud;

  // Per-criterion evaluation
  const evals: CriterionEvaluation[] = rows.map((r) => {
    const entry = r as unknown as KnowledgeEntry;
    const { status, reasoning } = detectStatus(entry, analysis, blob);
    const estLiftAud = (blendedMid && entry.valuation_lift_pct > 0 && status !== "met")
      ? Math.round((blendedMid * entry.valuation_lift_pct / 100) / 1000) * 1000
      : undefined;
    return { entry, status, reasoning, estLiftAud };
  });

  // Group by source
  const sourceMap = new Map<string, { entry_name: string; evals: CriterionEvaluation[] }>();
  for (const e of evals) {
    const arr = sourceMap.get(e.entry.source) ?? { entry_name: e.entry.source_name, evals: [] };
    arr.evals.push(e);
    sourceMap.set(e.entry.source, arr);
  }

  const sources: SourceReadiness[] = Array.from(sourceMap.entries()).map(([source, { entry_name, evals }]) => {
    const met = evals.filter((e) => e.status === "met").length;
    const partial = evals.filter((e) => e.status === "partial").length;
    const gap = evals.filter((e) => e.status === "gap").length;
    const pct = evals.length > 0 ? Math.round(((met + partial * 0.5) / evals.length) * 100) : 0;
    const topCriteria = [...evals]
      .filter((e) => e.status !== "met")
      .sort((a, b) => b.entry.valuation_lift_pct - a.entry.valuation_lift_pct)
      .slice(0, 3);
    return { source, source_name: entry_name, total: evals.length, met, partial, gap, pct, topCriteria };
  }).sort((a, b) => b.pct - a.pct);

  const totalMet = evals.filter((e) => e.status === "met").length;
  const totalPartial = evals.filter((e) => e.status === "partial").length;
  const overallPct = evals.length > 0 ? Math.round(((totalMet + totalPartial * 0.5) / evals.length) * 100) : 0;
  const highLeverageGaps = [...evals]
    .filter((e) => e.status !== "met")
    .sort((a, b) => b.entry.valuation_lift_pct - a.entry.valuation_lift_pct)
    .slice(0, 5);

  return {
    sources,
    totalCriteria: evals.length,
    totalMet,
    totalPartial,
    overallPct,
    highLeverageGaps,
    generatedAt: new Date().toISOString(),
  };
}
