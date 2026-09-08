/**
 * sample-runs — the single source of truth for every number the homepage
 * draws.
 *
 * PROVENANCE RULE. Nothing in this file is invented. Each field is either
 *
 *   (a) copied verbatim from the three anonymised runs that have been on
 *       the homepage since `marketing/sample-outputs.tsx` shipped
 *       (Idea 42 / MVP 58 / Revenue 71, with their valuation ranges and
 *       their four published dimension readings), or
 *   (b) read straight out of a shipped product module —
 *       `lib/benchmarks.ts` (the AU cohort bands per dimension per stage),
 *       `lib/data-room-templates.ts` (the investor checklist), and
 *       `lib/startup-growth-phases.ts` (the twelve phases).
 *
 * If a value does not exist in one of those places, the homepage does not
 * draw it. In particular there is no per-method valuation breakdown here:
 * the runs record one range each, not four separate method estimates, so
 * the page shows the range and names the methods in prose instead of
 * plotting numbers that were never produced.
 */

import { SVI_STAGE_BENCHMARKS } from "@/lib/benchmarks";
import { DATA_ROOM_STRUCTURE } from "@/lib/data-room-templates";
import {
  GROWTH_PHASES,
  getCurrentPhase,
} from "@/lib/startup-growth-phases";

// ── The eight dimensions ────────────────────────────────────────────────
// Keys match the scoring engine (`lib/svi-analysis.ts`); the labels are the
// plain-English names used in the report and the workspace.

export interface SviDimension {
  key: "ftv" | "mpc" | "ptd" | "tre" | "cgh" | "iri" | "lco" | "svm";
  /** Full name, as printed in the report. */
  label: string;
  /** Two-line form for tight radar axes at 390px. */
  lines: [string, string];
}

export const SVI_DIMENSIONS: SviDimension[] = [
  { key: "ftv", label: "Founder & Team", lines: ["Founder", "& Team"] },
  { key: "mpc", label: "Market & Problem", lines: ["Market", "& Problem"] },
  { key: "ptd", label: "Product & Tech", lines: ["Product", "& Tech"] },
  { key: "tre", label: "Traction & Revenue", lines: ["Traction", "& Revenue"] },
  {
    key: "cgh",
    label: "Cap Table & Governance",
    lines: ["Cap Table", "& Governance"],
  },
  { key: "iri", label: "Investor Readiness", lines: ["Investor", "Readiness"] },
  { key: "lco", label: "Legal & Compliance", lines: ["Legal", "& Compliance"] },
  {
    key: "svm",
    label: "Strategic Vision & Moat",
    lines: ["Strategic Vision", "& Moat"],
  },
];

// ── The three anonymised runs ───────────────────────────────────────────

export interface SampleRun {
  id: "idea" | "mvp" | "revenue";
  /** Stage label as published on the homepage. */
  stage: string;
  /** Overall SVI, 0–100. */
  sviScore: number;
  /** Valuation range, in AUD. */
  valuationLow: number;
  valuationHigh: number;
  /** Display strings, kept verbatim from the published cards. */
  valuationLowLabel: string;
  valuationHighLabel: string;
  /**
   * The dimension readings published for this run. Four of the eight —
   * the anonymised cards have always carried a subset, and the missing
   * four are deliberately absent rather than filled in.
   */
  measured: Partial<Record<SviDimension["key"], number>>;
  /**
   * Index into `SVI_STAGE_BENCHMARKS`. The benchmark table's own stage
   * labels are "Idea" (0), "Building" (2) and "Revenue" (5), which is how
   * each run is matched to its AU cohort band.
   */
  benchmarkStage: number;
  vignette: string;
}

export const SAMPLE_RUNS: SampleRun[] = [
  {
    id: "idea",
    stage: "Idea stage",
    sviScore: 42,
    valuationLow: 180_000,
    valuationHigh: 420_000,
    valuationLowLabel: "A$180K",
    valuationHighLabel: "A$420K",
    measured: { ftv: 55, mpc: 30, ptd: 15, tre: 60 },
    benchmarkStage: 0,
    vignette:
      "Solo founder, a one-pager, no code yet. Strong on founder-market fit, thin on evidence anyone wants it — so the action list opens with five customer interviews.",
  },
  {
    id: "mvp",
    stage: "MVP stage",
    sviScore: 58,
    valuationLow: 850_000,
    valuationHigh: 2_100_000,
    valuationLowLabel: "A$850K",
    valuationHighLabel: "A$2.1M",
    measured: { ftv: 62, mpc: 58, ptd: 55, tre: 40 },
    benchmarkStage: 2,
    vignette:
      "Two founders, 40 paying pilots, no round raised. Sits between pre-seed and seed; the range is built off the run-rate and where the eight dimensions actually landed.",
  },
  {
    id: "revenue",
    stage: "Revenue stage",
    sviScore: 71,
    valuationLow: 4_200_000,
    valuationHigh: 8_500_000,
    valuationLowLabel: "A$4.2M",
    valuationHighLabel: "A$8.5M",
    measured: { ftv: 70, mpc: 78, ptd: 65, tre: 72 },
    benchmarkStage: 5,
    vignette:
      "A$680K ARR, 14% month-on-month, four people. The recommendation was a priced seed — and the data room checklist and cap table came out of the same run.",
  },
];

export function runById(id: SampleRun["id"]): SampleRun {
  const found = SAMPLE_RUNS.find((r) => r.id === id);
  if (!found) throw new Error(`unknown sample run: ${id}`);
  return found;
}

// ── The AU cohort band, per dimension, for a run's stage ─────────────────

export interface CohortBand {
  key: SviDimension["key"];
  label: string;
  lines: [string, string];
  /** Cohort average for this dimension at this stage, 0–100. */
  avg: number;
  /** Top-quartile mark for this dimension at this stage, 0–100. */
  top: number;
  /** This run's published reading, when one exists. */
  measured: number | null;
}

/**
 * Joins a run's published readings onto the AU cohort band for its stage.
 * `measured` is `null` on the four dimensions the anonymised card never
 * carried — the chart draws a gap there rather than a guess.
 */
export function cohortBandsForRun(run: SampleRun): CohortBand[] {
  const bench = SVI_STAGE_BENCHMARKS.find((b) => b.stage === run.benchmarkStage);
  if (!bench) throw new Error(`no benchmark for stage ${run.benchmarkStage}`);
  return SVI_DIMENSIONS.map((d) => {
    const band = bench.dimensions[d.key];
    return {
      key: d.key,
      label: d.label,
      lines: d.lines,
      avg: band?.avg ?? 0,
      top: band?.top ?? 0,
      measured: run.measured[d.key] ?? null,
    };
  });
}

/** The benchmark table's own label for a run's stage ("Idea", "Revenue"…). */
export function cohortStageLabel(run: SampleRun): string {
  return (
    SVI_STAGE_BENCHMARKS.find((b) => b.stage === run.benchmarkStage)?.label ??
    run.stage
  );
}

// ── Where a run sits on the twelve-phase journey ─────────────────────────

export interface JourneyPhase {
  order: number;
  title: string;
  subtitle: string;
}

export const JOURNEY_PHASES: JourneyPhase[] = GROWTH_PHASES.map((p) => ({
  order: p.order,
  title: p.title,
  subtitle: p.subtitle,
}));

/**
 * The phase the product itself places a run in — `getCurrentPhase` is the
 * same function the workspace header and the SCN detector call, so the
 * marker on the homepage is the product's own answer, not a marketing one.
 */
export function phaseOrderForRun(run: SampleRun): number {
  return getCurrentPhase(run.benchmarkStage).order;
}

// ── The data room, as it fills up ────────────────────────────────────────

export interface DataRoomSection {
  /** "Corporate & Legal" — the template's leading number is stripped. */
  name: string;
  /** Stage at which an investor first expects this section. */
  stage: "idea" | "mvp" | "launch" | "revenue" | "raise";
  documents: number;
  investorImpact: "critical" | "high" | "medium" | "low";
}

export const DATA_ROOM_SECTIONS: DataRoomSection[] = DATA_ROOM_STRUCTURE.map(
  (folder) => ({
    name: folder.name.replace(/^\d+\.\s*/, ""),
    stage: folder.stage,
    documents: folder.documents.length,
    investorImpact: folder.investorImpact,
  }),
);

export const DATA_ROOM_STAGE_ORDER: DataRoomSection["stage"][] = [
  "idea",
  "mvp",
  "launch",
  "revenue",
  "raise",
];

export const DATA_ROOM_STAGE_LABELS: Record<DataRoomSection["stage"], string> = {
  idea: "Idea",
  mvp: "MVP",
  launch: "Launched",
  revenue: "Revenue",
  raise: "Raising",
};

export interface DataRoomStep {
  stage: DataRoomSection["stage"];
  label: string;
  /** Documents added at this stage. */
  added: number;
  /** Documents on the list once this stage is reached. */
  cumulative: number;
  /** Sections that first appear at this stage. */
  sections: string[];
}

/** The checklist as it grows, stage by stage. Derived, never hand-typed. */
export function dataRoomBuildUp(): DataRoomStep[] {
  let running = 0;
  return DATA_ROOM_STAGE_ORDER.map((stage) => {
    const sections = DATA_ROOM_SECTIONS.filter((s) => s.stage === stage);
    const added = sections.reduce((sum, s) => sum + s.documents, 0);
    running += added;
    return {
      stage,
      label: DATA_ROOM_STAGE_LABELS[stage],
      added,
      cumulative: running,
      sections: sections.map((s) => s.name),
    };
  });
}

export const DATA_ROOM_TOTAL_DOCUMENTS = DATA_ROOM_SECTIONS.reduce(
  (sum, s) => sum + s.documents,
  0,
);
