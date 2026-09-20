// cohort-report — the BlockID Cohort Report a program hands its sponsors
// (G21 P2-C, 2026-09-20). Evolves `quarterly-report.ts` (T0272): the old
// render + summary stay exported from here under their original names so
// `GET /api/reports/quarterly` keeps working unchanged.
//
// Sections (goal doc § P2-C):
//   cover · cohort movement (median SVI first vs latest snapshot, Δ; "one
//   snapshot so far" fallback) · median improvement per dimension · benchmark
//   line through `publishBenchmark` (n ≥ 10 only, always with n) · evidence
//   completion (% of startups with ≥ L3 on each dimension) · outputs
//   (decisions tally, shortlisted, dossiers produced, feedback letters sent)
//   · top strengths / top gaps across the cohort · human-review note
//   (override count — "humans made every decision") · reviewer signature
//   block (name, role, date, methodology version) · disclaimer + entity.
//
// Pure: `buildCohortReport()` folds the inputs, `renderCohortReportHtml()`
// prints the same print-ready HTML pattern as the quarterly report,
// `cohortReportCsv()` emits one Excel-safe row per startup. The PDF twin is
// `lib/pdf/cohort-report-pdf.tsx`. The methodology line never states an
// agent count (messaging map § 11).

import { LEGAL_ENTITY, legalLine } from "@/lib/site/legal-entity";
import { SVI_VERSION } from "@/lib/svi-analysis";
import { formatBenchmarkLine, notEnoughLine, publishBenchmark, type PublishedBenchmark } from "@/lib/benchmarks/publication-rules";
import {
  CSV_BOM,
  DIMENSION_KEYS,
  DIMENSION_LABELS,
  COHORT_DECISION_LABELS,
  csvCell,
  median,
  pipelineCounts,
  stageName,
  type BatchStatus,
  type CohortDecision,
  type DimensionKey,
  type PipelineCounts,
  type RubricWeights,
} from "./batch-shared";
import { esc, evaluatorDisclaimerText } from "./quarterly-report";

// The quarterly report keeps its names (thin aliases — api/reports/quarterly).
export {
  DOCTORAL_SENTENCE,
  LEGAL_ENTITY_LINE,
  cohortRowsToReportStartups,
  esc,
  evaluatorDisclaimerText,
  quarterLabelFor,
  renderQuarterlyReportHtml,
  summariseQuarterly,
  type QuarterlyReportData,
  type QuarterlyReportStartup,
  type QuarterlySummary,
} from "./quarterly-report";

export const COHORT_REPORT_METHODOLOGY =
  "The Startup Value Index scores every startup on the same eight business dimensions, checked against the underlying evidence, with an evidence confidence level beside every score. BlockID structures the evidence and standardises the first-pass analysis. Humans make the decision.";

export const HUMAN_REVIEW_SENTENCE = "Humans made every decision in this report; the SVI is the first pass, never the verdict.";

/** ≥ L3 (document uploaded) counts as evidence-backed for the completion table. */
export const EVIDENCE_COMPLETE_LEVEL = 3;

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export interface CohortReportStartup {
  itemId: number;
  projectId: string;
  name: string;
  status: BatchStatus;
  svi: number | null;
  confidence: number | null;
  verification: number;
  stage: number | null;
  delta: number | null;
  topStrength: string | null;
  topGap: string | null;
  dimensionScores: Partial<Record<DimensionKey, number>> | null;
  decision: CohortDecision | null;
  assessmentStatus: "draft" | "submitted" | null;
  shortlisted: boolean;
  /** Highest evidence rung per dimension (0 = none, 1–6 = L1–L6). */
  evidenceLevels: Partial<Record<DimensionKey, number>>;
  evidenceCompletionPct: number | null;
  dossierProduced: boolean;
  feedbackLetterSent: boolean;
  reportUrl: string | null;
}

export interface CohortSnapshotRowLite {
  projectId: string | null;
  itemId: number | null;
  svi: number | null;
  confidence: number | null;
  dimensionScores: Partial<Record<DimensionKey, number>> | null;
}

export interface CohortSnapshotLite {
  id: string;
  takenAt: string;
  rows: CohortSnapshotRowLite[];
}

export interface CohortReportReviewer {
  name: string;
  role: string;
}

export interface CohortReportInput {
  programName: string | null;
  cohortName: string;
  /** "Q3 2026" or "Cohort 5 · Jul–Sep 2026". */
  periodLabel: string;
  generatedAt: string;
  methodologyVersion?: string | null;
  weights: RubricWeights | null;
  startups: CohortReportStartup[];
  /** Oldest first or any order — sorted here. */
  snapshots: CohortSnapshotLite[];
  overridesCount: number;
  reviewer: CohortReportReviewer | null;
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

export interface CohortMovementPoint {
  takenAt: string;
  n: number;
  medianSvi: number | null;
  medianConfidence: number | null;
}

export interface CohortMovement {
  first: CohortMovementPoint | null;
  latest: CohortMovementPoint | null;
  delta: number | null;
  /** "one snapshot so far" / "no snapshot yet — current scores shown". */
  note: string | null;
}

export interface DimensionImprovementRow {
  key: DimensionKey;
  label: string;
  first: number | null;
  latest: number | null;
  delta: number | null;
}

export interface EvidenceCompletionRow {
  key: DimensionKey;
  label: string;
  /** % of scored startups with ≥ L3 on the dimension. */
  pct: number;
  count: number;
}

export interface CohortOutputs {
  decisions: PipelineCounts;
  shortlisted: number;
  dossiers: number;
  letters: number;
}

export interface CountedLabel {
  label: string;
  count: number;
}

export interface CohortReportData {
  cover: {
    programName: string | null;
    cohortName: string;
    periodLabel: string;
    generatedAt: string;
    n: number;
    scored: number;
    methodologyVersion: string;
    entity: string;
  };
  movement: CohortMovement;
  dimensionImprovement: DimensionImprovementRow[];
  benchmark: PublishedBenchmark | null;
  benchmarkLine: string;
  evidenceCompletion: EvidenceCompletionRow[];
  outputs: CohortOutputs;
  strengths: CountedLabel[];
  gaps: CountedLabel[];
  humanReview: { overrides: number; sentence: string };
  signature: { name: string; role: string; date: string; methodologyVersion: string };
  methodology: string;
  disclaimer: string;
  weightsNote: string;
  startups: CohortReportStartup[];
}

function finite(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function point(takenAt: string, rows: ReadonlyArray<{ svi: number | null; confidence: number | null }>): CohortMovementPoint {
  const svis = rows.map((r) => finite(r.svi)).filter((v): v is number => v != null);
  const confs = rows.map((r) => finite(r.confidence)).filter((v): v is number => v != null);
  return { takenAt, n: svis.length, medianSvi: median(svis), medianConfidence: median(confs) };
}

function medianDim(rows: ReadonlyArray<{ dimensionScores: Partial<Record<DimensionKey, number>> | null }>, k: DimensionKey): number | null {
  return median(rows.map((r) => finite(r.dimensionScores?.[k])).filter((v): v is number => v != null));
}

function countLabels(values: Array<string | null>): CountedLabel[] {
  const m = new Map<string, number>();
  for (const v of values) if (v) m.set(v, (m.get(v) ?? 0) + 1);
  return Array.from(m.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 3);
}

export function fmtReportDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "Australia/Sydney" });
}

export function buildCohortReport(input: CohortReportInput): CohortReportData {
  const scoredRows = input.startups.filter((s) => s.svi != null);
  const scored = scoredRows.length;
  const methodologyVersion = (input.methodologyVersion ?? "").trim() || SVI_VERSION;

  // Movement — snapshots sorted oldest first; the current scores are the
  // latest point when no snapshot has been taken yet.
  const snaps = [...input.snapshots].sort((a, b) => (a.takenAt < b.takenAt ? -1 : a.takenAt > b.takenAt ? 1 : 0));
  let movement: CohortMovement;
  if (snaps.length >= 2) {
    const first = point(snaps[0].takenAt, snaps[0].rows);
    const latest = point(snaps[snaps.length - 1].takenAt, snaps[snaps.length - 1].rows);
    movement = {
      first,
      latest,
      delta: first.medianSvi != null && latest.medianSvi != null ? Math.round((latest.medianSvi - first.medianSvi) * 10) / 10 : null,
      note: null,
    };
  } else if (snaps.length === 1) {
    movement = { first: point(snaps[0].takenAt, snaps[0].rows), latest: null, delta: null, note: "One snapshot so far — movement appears after the next re-score." };
  } else {
    movement = { first: null, latest: scored > 0 ? point(input.generatedAt, scoredRows) : null, delta: null, note: "No cohort snapshot yet — current scores shown; take a snapshot to track movement." };
  }

  const firstRows = snaps.length >= 2 ? snaps[0].rows : null;
  const latestRows = snaps.length >= 2 ? snaps[snaps.length - 1].rows : scoredRows;
  const dimensionImprovement: DimensionImprovementRow[] = DIMENSION_KEYS.map((k) => {
    const first = firstRows ? medianDim(firstRows, k) : null;
    const latest = medianDim(latestRows, k);
    return { key: k, label: DIMENSION_LABELS[k], first, latest, delta: first != null && latest != null ? Math.round((latest - first) * 10) / 10 : null };
  });

  const medianSvi = median(scoredRows.map((s) => s.svi as number));
  const benchmark = medianSvi == null ? null : publishBenchmark({ median: medianSvi, n: scored, segment: `${input.cohortName} cohort` });
  const benchmarkLine = benchmark ? formatBenchmarkLine(benchmark) : notEnoughLine(scored, `${input.cohortName} cohort`);

  const evidenceCompletion: EvidenceCompletionRow[] = DIMENSION_KEYS.map((k) => {
    const count = scoredRows.filter((s) => (s.evidenceLevels[k] ?? 0) >= EVIDENCE_COMPLETE_LEVEL).length;
    return { key: k, label: DIMENSION_LABELS[k], count, pct: scored === 0 ? 0 : Math.round((count / scored) * 100) };
  });

  const outputs: CohortOutputs = {
    decisions: pipelineCounts(input.startups),
    shortlisted: input.startups.filter((s) => s.shortlisted).length,
    dossiers: input.startups.filter((s) => s.dossierProduced).length,
    letters: input.startups.filter((s) => s.feedbackLetterSent).length,
  };

  const weightsNote =
    input.weights && DIMENSION_KEYS.some((k) => Math.abs((input.weights as RubricWeights)[k] - 12.5) >= 0.01)
      ? `Weighted score uses this program's rubric weights: ${DIMENSION_KEYS.map((k) => `${DIMENSION_LABELS[k]} ${input.weights?.[k]}%`).join(", ")}. The SVI itself is unweighted so cohorts stay comparable.`
      : "Weighted score uses equal weights across the 8 dimensions (the default rubric).";

  return {
    cover: {
      programName: input.programName,
      cohortName: input.cohortName,
      periodLabel: input.periodLabel,
      generatedAt: input.generatedAt,
      n: input.startups.length,
      scored,
      methodologyVersion,
      entity: legalLine(),
    },
    movement,
    dimensionImprovement,
    benchmark,
    benchmarkLine,
    evidenceCompletion,
    outputs,
    strengths: countLabels(scoredRows.map((s) => s.topStrength)),
    gaps: countLabels(scoredRows.map((s) => s.topGap)),
    humanReview: {
      overrides: input.overridesCount,
      sentence: `${HUMAN_REVIEW_SENTENCE} ${input.overridesCount === 0 ? "No dimension score was overridden by a reviewer." : `${input.overridesCount} reviewer override${input.overridesCount === 1 ? "" : "s"} recorded with a reason code, shown beside the model score and never replacing it.`}`,
    },
    signature: {
      name: input.reviewer?.name?.trim() || "",
      role: input.reviewer?.role?.trim() || "Program reviewer",
      date: fmtReportDate(input.generatedAt),
      methodologyVersion,
    },
    methodology: COHORT_REPORT_METHODOLOGY,
    disclaimer: evaluatorDisclaimerText(),
    weightsNote,
    startups: input.startups,
  };
}

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

function fmtDelta(d: number | null): string {
  if (d == null) return "—";
  if (d === 0) return "±0";
  return `${d > 0 ? "▲" : "▼"} ${Math.abs(d)}`;
}

function num(v: number | null | undefined, digits = 0): string {
  return v == null || !Number.isFinite(v) ? "—" : v.toFixed(digits);
}

function startupLine(s: CohortReportStartup): string {
  if (s.svi == null) return s.status === "failed" ? "scoring failed — re-run from the cohort table" : "not scored yet";
  const parts = [`SVI ${Math.round(s.svi)}`, `confidence ${s.confidence == null ? "—" : `${Math.round(s.confidence)} %`}`, `L${Math.max(0, Math.min(5, s.verification))}`, stageName(s.stage), fmtDelta(s.delta)];
  if (s.decision) parts.push(`${COHORT_DECISION_LABELS[s.decision]}${s.assessmentStatus === "submitted" ? "" : " (draft)"}`);
  if (s.shortlisted) parts.push("shortlisted");
  const tail: string[] = [];
  if (s.topStrength) tail.push(`strongest on ${s.topStrength}`);
  if (s.topGap) tail.push(`biggest gap ${s.topGap}`);
  return `${parts.join(" · ")}${tail.length ? ` — ${tail.join(", ")}` : ""}`;
}

export function renderCohortReportHtml(data: CohortReportData, base = "https://blockid.au", nonce: string | null = null): string {
  const title = `${data.cover.cohortName} — BlockID Cohort Report ${data.cover.periodLabel}`;
  const m = data.movement;
  const movementTiles = [
    `<div class="tile"><div class="v">${m.first?.medianSvi == null ? "—" : esc(m.first.medianSvi)}</div><div class="l">Median SVI · first snapshot${m.first ? ` (${esc(fmtReportDate(m.first.takenAt))}, n = ${m.first.n})` : ""}</div></div>`,
    `<div class="tile"><div class="v">${m.latest?.medianSvi == null ? "—" : esc(m.latest.medianSvi)}</div><div class="l">Median SVI · latest${m.latest ? ` (${esc(fmtReportDate(m.latest.takenAt))}, n = ${m.latest.n})` : ""}</div></div>`,
    `<div class="tile"><div class="v" data-movement-delta>${esc(fmtDelta(m.delta))}</div><div class="l">Δ median SVI</div></div>`,
    `<div class="tile"><div class="v">${m.latest?.medianConfidence == null ? "—" : `${esc(m.latest.medianConfidence)} %`}</div><div class="l">Median evidence confidence</div></div>`,
  ].join("");

  const dimRows = data.dimensionImprovement
    .map((r) => `<tr><td>${esc(r.label)}</td><td class="n">${esc(num(r.first, 1))}</td><td class="n">${esc(num(r.latest, 1))}</td><td class="n">${esc(fmtDelta(r.delta))}</td></tr>`)
    .join("");
  const evRows = data.evidenceCompletion.map((r) => `<tr><td>${esc(r.label)}</td><td class="n">${r.count} of ${data.cover.scored}</td><td class="n">${r.pct} %</td></tr>`).join("");
  const list = (xs: CountedLabel[], empty: string) => (xs.length === 0 ? `<p class="muted">${esc(empty)}</p>` : `<ul>${xs.map((x) => `<li>${esc(x.label)} — ${x.count} startup${x.count === 1 ? "" : "s"}</li>`).join("")}</ul>`);
  const startupRows = data.startups.map((s) => `<li><strong>${esc(s.name)}</strong> — ${esc(startupLine(s))}${s.reportUrl ? ` <a href="${esc(base + s.reportUrl)}">report</a>` : ""}</li>`).join("\n");

  return `<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { font: 11pt/1.5 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #111827; margin: 0; padding: 24px; background: #fff; max-width: 820px; margin-inline: auto; }
  h1 { font-size: 24pt; line-height: 1.2; margin: 0 0 8px; }
  h2 { font-size: 14pt; margin: 28px 0 8px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
  h3 { font-size: 11pt; margin: 12px 0 4px; }
  .cover { padding: 48px 0 32px; border-bottom: 2px solid #111827; page-break-after: always; }
  .eyebrow { text-transform: uppercase; letter-spacing: .08em; font-size: 9pt; color: #6b7280; }
  .muted { color: #6b7280; }
  .tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 12px 0; }
  .tile { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 12px; }
  .tile .v { font-size: 20pt; font-weight: 700; }
  .tile .l { font-size: 9pt; color: #6b7280; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  table { border-collapse: collapse; width: 100%; font-size: 10pt; }
  th, td { text-align: left; padding: 4px 8px; border-bottom: 1px solid #e5e7eb; }
  td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; }
  ul { padding-left: 18px; } li { margin: 4px 0; }
  .sig { margin-top: 24px; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 16px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; }
  .sig .k { font-size: 8.5pt; text-transform: uppercase; letter-spacing: .06em; color: #6b7280; }
  .foot { margin-top: 32px; font-size: 8.5pt; color: #4b5563; border-top: 1px solid #e5e7eb; padding-top: 12px; }
  .print { position: fixed; top: 12px; right: 12px; }
  @media print { .print { display: none; } body { padding: 0; } }
  @media (max-width: 640px) { .tiles, .cols, .sig { grid-template-columns: 1fr 1fr; } }
</style>
</head>
<body>
<button class="print" type="button" id="print-btn">Save as PDF</button>
${nonce ? `<script nonce="${esc(nonce)}">document.getElementById("print-btn").addEventListener("click",function(){window.print()});</script>` : ""}
<header class="cover">
  <div class="eyebrow">BlockID Cohort Report · ${esc(data.cover.periodLabel)}</div>
  <h1>${esc(data.cover.cohortName)}</h1>
  ${data.cover.programName ? `<p>Prepared by ${esc(data.cover.programName)}</p>` : ""}
  <p class="muted">Generated ${esc(fmtReportDate(data.cover.generatedAt))} · ${data.cover.n} startup${data.cover.n === 1 ? "" : "s"} · ${data.cover.scored} scored on one rubric · Startup Value Index v${esc(data.cover.methodologyVersion)}</p>
  <p class="muted">${esc(data.cover.entity)}</p>
</header>

<section aria-label="Cohort movement" data-section="movement">
  <h2>Cohort movement</h2>
  <div class="tiles">${movementTiles}</div>
  ${m.note ? `<p class="muted" data-movement-note>${esc(m.note)}</p>` : ""}
</section>

<section aria-label="Median improvement per dimension" data-section="dimensions">
  <h2>Median improvement per dimension</h2>
  <table>
    <thead><tr><th>Dimension</th><th class="n">First</th><th class="n">Latest</th><th class="n">Δ</th></tr></thead>
    <tbody>${dimRows}</tbody>
  </table>
</section>

<section aria-label="Benchmark" data-section="benchmark">
  <h2>Benchmark</h2>
  <p data-benchmark-line>${esc(data.benchmarkLine)}</p>
</section>

<section aria-label="Evidence completion" data-section="evidence">
  <h2>Evidence completion</h2>
  <p class="muted">Share of scored startups with at least a document on file (L3 or higher) for each dimension.</p>
  <table>
    <thead><tr><th>Dimension</th><th class="n">Startups</th><th class="n">Share</th></tr></thead>
    <tbody>${evRows}</tbody>
  </table>
</section>

<section aria-label="Outputs" data-section="outputs">
  <h2>Outputs</h2>
  <div class="tiles">
    <div class="tile"><div class="v" data-output-proceed>${data.outputs.decisions.proceed}</div><div class="l">Proceed</div></div>
    <div class="tile"><div class="v" data-output-track>${data.outputs.decisions.track}</div><div class="l">Track</div></div>
    <div class="tile"><div class="v" data-output-pass>${data.outputs.decisions.pass}</div><div class="l">Pass</div></div>
    <div class="tile"><div class="v" data-output-undecided>${data.outputs.decisions.undecided}</div><div class="l">No submitted decision</div></div>
  </div>
  <div class="tiles">
    <div class="tile"><div class="v">${data.outputs.shortlisted}</div><div class="l">Shortlisted</div></div>
    <div class="tile"><div class="v">${data.outputs.dossiers}</div><div class="l">BlockID Dossiers produced</div></div>
    <div class="tile"><div class="v">${data.outputs.letters}</div><div class="l">Feedback letters sent</div></div>
    <div class="tile"><div class="v">${data.cover.scored}</div><div class="l">Startups scored</div></div>
  </div>
</section>

<section aria-label="Strengths and gaps" data-section="strengths-gaps">
  <h2>Across the cohort</h2>
  <div class="cols">
    <div><h3>Top strengths</h3>${list(data.strengths, "No scored startup yet.")}</div>
    <div><h3>Top gaps</h3>${list(data.gaps, "No scored startup yet.")}</div>
  </div>
</section>

<section aria-label="Human review" data-section="human-review">
  <h2>Human review</h2>
  <p data-human-review>${esc(data.humanReview.sentence)}</p>
</section>

<section aria-label="Startups">
  <h2>Startups</h2>
  <ul>
${startupRows}
  </ul>
</section>

<section aria-label="Reviewer signature" class="sig" data-section="signature">
  <div><div class="k">Reviewer</div><div>${esc(data.signature.name || "____________________")}</div></div>
  <div><div class="k">Role</div><div>${esc(data.signature.role)}</div></div>
  <div><div class="k">Date</div><div>${esc(data.signature.date)}</div></div>
  <div><div class="k">Methodology</div><div>Startup Value Index v${esc(data.signature.methodologyVersion)}</div></div>
</section>

<section aria-label="Methodology" class="foot">
  <p><strong>Methodology.</strong> ${esc(data.methodology)} ${esc(data.weightsNote)} "Δ" compares each startup's SVI with its previous score on the platform.</p>
  <p data-surface="evaluator_report">${esc(data.disclaimer)}</p>
  <p>Produced by ${esc(LEGAL_ENTITY.brand)}.au · ${esc(data.cover.entity)} · <a href="${esc(base)}/legal/disclaimers">Full disclaimers</a> · <a href="${esc(base)}/methodology/governance">Score governance</a></p>
</section>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// CSV — one row per startup
// ---------------------------------------------------------------------------

export const COHORT_REPORT_CSV_HEADERS = [
  "Startup",
  "Status",
  "SVI",
  "Evidence confidence %",
  "Verification level",
  "Stage",
  "Delta since last",
  "Decision",
  "Assessment status",
  "Shortlisted",
  "Top strength",
  "Top gap",
  "Evidence completion %",
  ...DIMENSION_KEYS.map((k) => DIMENSION_LABELS[k]),
  ...DIMENSION_KEYS.map((k) => `${DIMENSION_LABELS[k]} evidence level`),
  "Dossier produced",
  "Feedback letter sent",
  "Report link",
] as const;

export function cohortReportCsv(data: CohortReportData, base = "https://blockid.au"): string {
  const lines = [COHORT_REPORT_CSV_HEADERS.map(csvCell).join(",")];
  for (const s of data.startups) {
    lines.push(
      [
        s.name,
        s.status,
        s.svi,
        s.confidence,
        s.verification,
        s.stage == null ? "" : stageName(s.stage),
        s.delta,
        s.decision ?? "",
        s.assessmentStatus ?? "",
        s.shortlisted ? "yes" : "no",
        s.topStrength,
        s.topGap,
        s.evidenceCompletionPct,
        ...DIMENSION_KEYS.map((k) => s.dimensionScores?.[k] ?? ""),
        ...DIMENSION_KEYS.map((k) => (s.evidenceLevels[k] ? `L${s.evidenceLevels[k]}` : "")),
        s.dossierProduced ? "yes" : "no",
        s.feedbackLetterSent ? "yes" : "no",
        s.reportUrl ? `${base}${s.reportUrl}` : "",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return CSV_BOM + lines.join("\r\n") + "\r\n";
}

export function cohortReportFilename(cohortName: string, ext: "html" | "pdf" | "csv"): string {
  const slug = cohortName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "cohort";
  return `blockid-cohort-report-${slug}.${ext}`;
}
